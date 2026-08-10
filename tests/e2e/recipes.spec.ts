import { expect, test } from '@playwright/test'
import { signInStagingPair } from './helpers/auth'

function fixtureTitle(prefix: string): string {
  return `${prefix} ${crypto.randomUUID()}`
}

async function moveCurrentRecipeToTrash(page: import('@playwright/test').Page, title: string): Promise<void> {
  await page.getByRole('button', { name: 'Mover para a lixeira' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText(title)
  await dialog.getByRole('button', { name: 'Mover para a lixeira' }).click()
  await expect(page.getByRole('heading', { name: 'Receitas' })).toBeVisible()
  await expect(page.getByRole('button', { name: `Abrir ${title}` })).toHaveCount(0)
}

test('creates, reloads, edits and soft-deletes a recipe through the real UI', async ({ page }) => {
  const originalTitle = fixtureTitle('E2E receita')
  const editedTitle = `${originalTitle} editada`

  await signInStagingPair(page)
  await expect(page.getByRole('heading', { name: 'Receitas' })).toBeVisible()

  await page.getByRole('button', { name: 'Nova receita' }).first().click()
  await expect(page.getByRole('heading', { name: 'Nova receita' })).toBeVisible()
  await page.getByLabel('Título').fill(originalTitle)
  await page.getByRole('button', { name: 'Salvar receita' }).click()

  await expect(page.getByRole('heading', { name: originalTitle })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cozinhar agora' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Disponibilidade offline' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Fotos da receita/i })).toBeVisible()

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Receitas' })).toBeVisible()
  await page.getByRole('button', { name: `Abrir ${originalTitle}` }).click()
  await expect(page.getByRole('heading', { name: originalTitle })).toBeVisible()

  await page.getByRole('button', { name: 'Editar receita' }).click()
  await page.getByLabel('Título').fill(editedTitle)
  await page.getByRole('button', { name: 'Salvar receita' }).click()
  await expect(page.getByRole('heading', { name: editedTitle })).toBeVisible()

  await moveCurrentRecipeToTrash(page, editedTitle)
})
