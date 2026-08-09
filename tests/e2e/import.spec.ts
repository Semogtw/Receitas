import { expect, test, type Page } from '@playwright/test'
import { signInStagingPair } from './helpers/auth'

function requiredFixture(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required for import E2E fixture coverage`)
  return value
}

async function openImport(page: Page) {
  await page.goto('/recipes')
  const trigger = page.getByRole('button', { name: /importar/i }).first()
  await expect(trigger).toBeVisible()
  await trigger.click()
  await expect(page.locator('input[type="url"], textarea').first()).toBeVisible()
}

async function selectPasteMode(page: Page) {
  const textarea = page.locator('textarea').first()
  if (await textarea.isVisible().catch(() => false)) return textarea
  const textMode = page.getByRole('button', { name: /texto|colar/i }).first()
  await expect(textMode).toBeVisible()
  await textMode.click()
  await expect(textarea).toBeVisible()
  return textarea
}

async function submitFormContaining(page: Page, locator: ReturnType<Page['locator']>) {
  const form = locator.locator('xpath=ancestor::form[1]')
  await expect(form).toBeVisible()
  await form.locator('button[type="submit"]').first().click()
}

async function submitUrl(page: Page, url: string) {
  const input = page.locator('input[type="url"]').first()
  await expect(input).toBeVisible()
  await input.fill(url)
  await submitFormContaining(page, input)
}

async function expectReviewTitle(page: Page, expected: string) {
  const title = page.getByLabel(/título/i).first()
  await expect(title).toBeVisible()
  await expect(title).toHaveValue(expected)
  return title
}

test.beforeEach(async ({ page }) => {
  await signInStagingPair(page)
})

test('pasted text is reviewable and cancel never saves canonical recipe data', async ({ page }) => {
  const uniqueTitle = `E2E PASTE CANCEL ${Date.now()}`
  await openImport(page)
  const textarea = await selectPasteMode(page)
  await textarea.fill(`${uniqueTitle}\n\nIngredientes\n2 xícaras de farinha\n1 ovo\n\nModo de preparo\nMisture tudo.\nAsse até dourar.`)
  await submitFormContaining(page, textarea)

  const title = await expectReviewTitle(page, uniqueTitle)
  await title.fill(`${uniqueTitle} EDITED`)
  await page.getByRole('button', { name: /cancelar/i }).last().click()

  await expect(page.getByRole('heading', { name: 'Receitas' })).toBeVisible()
  await expect(page.getByText(`${uniqueTitle} EDITED`, { exact: true })).toHaveCount(0)
})

test('controlled JSON-LD URL reaches editable review instead of saving automatically', async ({ page }) => {
  const url = requiredFixture('E2E_IMPORT_JSONLD_URL')
  const expectedTitle = requiredFixture('E2E_IMPORT_JSONLD_TITLE')
  await openImport(page)
  await submitUrl(page, url)

  await expectReviewTitle(page, expectedTitle)
  await expect(page.getByRole('button', { name: /salvar|confirmar/i }).last()).toBeVisible()
  await page.getByRole('button', { name: /cancelar/i }).last().click()
  await expect(page.getByText(expectedTitle, { exact: true })).toHaveCount(0)
})

test('controlled HTML fallback URL still ends in mandatory editable review', async ({ page }) => {
  const url = requiredFixture('E2E_IMPORT_HTML_URL')
  const expectedTitle = requiredFixture('E2E_IMPORT_HTML_TITLE')
  await openImport(page)
  await submitUrl(page, url)

  await expectReviewTitle(page, expectedTitle)
  await page.getByRole('button', { name: /cancelar/i }).last().click()
})

test('loopback URL is rejected by server policy and never reaches review', async ({ page }) => {
  await openImport(page)
  await submitUrl(page, 'http://127.0.0.1/private-recipe')

  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel(/título/i)).toHaveCount(0)
})

test('controlled oversized remote response is rejected before review', async ({ page }) => {
  const url = requiredFixture('E2E_IMPORT_OVERSIZED_URL')
  await openImport(page)
  await submitUrl(page, url)

  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel(/título/i)).toHaveCount(0)
})
