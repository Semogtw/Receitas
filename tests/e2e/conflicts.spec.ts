import { expect, test, type Page } from '@playwright/test'
import { signInStagingPair } from './helpers/auth'

function fixtureTitle(prefix: string): string {
  return `${prefix} ${crypto.randomUUID()}`
}

async function createRecipe(page: Page, title: string): Promise<void> {
  await page.goto('/recipes')
  await page.getByRole('button', { name: 'Nova receita' }).first().click()
  await page.getByLabel('Título').fill(title)
  await page.getByRole('button', { name: 'Salvar receita' }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}

async function openRecipeForEdit(page: Page, title: string): Promise<void> {
  await page.goto('/recipes')
  await page.getByRole('button', { name: `Abrir ${title}` }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await page.getByRole('button', { name: 'Editar receita' }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}

async function saveTitle(page: Page, title: string): Promise<void> {
  await page.getByLabel('Título').fill(title)
  await page.getByRole('button', { name: 'Salvar receita' }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}

async function permanentlyDeleteAfterSync(page: Page, title: string): Promise<void> {
  await page.goto('/settings')
  const row = page.locator('.trash-panel__item').filter({ hasText: title })
  await expect(row).toBeVisible({ timeout: 30_000 })
  await row.getByRole('button', { name: 'Excluir definitivamente' }).click()
  const dialog = page.getByRole('dialog', { name: new RegExp(`Excluir.*${title}.*definitivamente`) })

  for (let attempt = 0; attempt < 6; attempt += 1) {
    await dialog.getByRole('button', { name: 'Excluir definitivamente' }).click()
    if (await row.count() === 0) break
    const pending = page.getByRole('alert').filter({ hasText: 'alteração local pendente' })
    if (await pending.count()) {
      await page.waitForTimeout(1_500)
      continue
    }
    break
  }
  await expect(row).toHaveCount(0, { timeout: 30_000 })
}

test('overlapping concurrent recipe edits create a real conflict and explicit local resolution wins', async ({ page, context, browser }) => {
  const baseTitle = fixtureTitle('E2E conflito base')
  const localTitle = `${baseTitle} local`
  const remoteTitle = `${baseTitle} remoto`

  await signInStagingPair(page)
  await createRecipe(page, baseTitle)

  const origin = new URL(page.url()).origin
  const remoteContext = await browser.newContext({ baseURL: origin })
  const remotePage = await remoteContext.newPage()
  try {
    await signInStagingPair(remotePage)
    await expect(remotePage.getByRole('button', { name: `Abrir ${baseTitle}` })).toBeVisible({ timeout: 60_000 })

    // Both editors start from the same synchronized revision.
    await openRecipeForEdit(page, baseTitle)
    await openRecipeForEdit(remotePage, baseTitle)

    await context.setOffline(true)
    await saveTitle(page, localTitle)
    await saveTitle(remotePage, remoteTitle)

    // A clean third context proves that B's divergent version reached the server
    // before A is allowed to reconnect with its stale base revision.
    const witnessContext = await browser.newContext({ baseURL: origin })
    const witnessPage = await witnessContext.newPage()
    try {
      await signInStagingPair(witnessPage)
      await witnessPage.goto('/recipes')
      await expect(witnessPage.getByRole('button', { name: `Abrir ${remoteTitle}` })).toBeVisible({ timeout: 60_000 })
    } finally {
      await witnessContext.close()
    }

    await context.setOffline(false)
    await page.goto('/conflicts')
    await expect(page.getByText('Conflito de edição')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText(localTitle, { exact: true })).toBeVisible()
    await expect(page.getByText(remoteTitle, { exact: true })).toBeVisible()

    const resolver = page.locator('.conflict-resolver').filter({ hasText: localTitle })
    await resolver.getByRole('button', { name: 'Usar versão local' }).click()
    await expect(page.getByText('Nenhum conflito aguardando resolução.')).toBeVisible({ timeout: 30_000 })

    await remotePage.goto('/recipes')
    await expect(remotePage.getByRole('button', { name: `Abrir ${localTitle}` })).toBeVisible({ timeout: 60_000 })

    // Cleanup after both contexts agree on the resolved canonical version.
    await remotePage.getByRole('button', { name: `Abrir ${localTitle}` }).click()
    await remotePage.getByRole('button', { name: 'Mover para a lixeira' }).click()
    await remotePage.getByRole('dialog').getByRole('button', { name: 'Mover para a lixeira' }).click()

    await page.goto('/recipes')
    await expect(page.getByRole('button', { name: `Abrir ${localTitle}` })).toHaveCount(0, { timeout: 60_000 })
    await permanentlyDeleteAfterSync(remotePage, localTitle)
  } finally {
    if (!context.pages().every((candidate) => candidate.isClosed())) await context.setOffline(false)
    await remoteContext.close()
  }
})
