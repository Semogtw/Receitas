import { expect, test, type Page } from '@playwright/test'
import { signInStagingPair } from './helpers/auth'

function fixtureTitle(): string {
  return `E2E lixeira ${crypto.randomUUID()}`
}

async function createRecipe(page: Page, title: string): Promise<void> {
  await page.goto('/recipes')
  await page.getByRole('button', { name: 'Nova receita' }).first().click()
  await page.getByLabel('Título').fill(title)
  await page.getByRole('button', { name: 'Salvar receita' }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}

async function softDeleteCurrentRecipe(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Mover para a lixeira' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Mover para a lixeira' }).click()
  await expect(page.getByRole('heading', { name: 'Receitas' })).toBeVisible()
}

function trashRow(page: Page, title: string) {
  return page.locator('.trash-panel__item').filter({ hasText: title })
}

test('trash restore round-trip syncs and supports privileged permanent cleanup', async ({ page, browser }) => {
  const title = fixtureTitle()

  await signInStagingPair(page)
  await createRecipe(page, title)

  const origin = new URL(page.url()).origin
  const peerContext = await browser.newContext({ baseURL: origin })
  const peerPage = await peerContext.newPage()
  try {
    await signInStagingPair(peerPage)
    await peerPage.goto('/recipes')
    await expect(peerPage.getByRole('button', { name: `Abrir ${title}` })).toBeVisible({ timeout: 60_000 })

    await softDeleteCurrentRecipe(page)
    await expect(peerPage.getByRole('button', { name: `Abrir ${title}` })).toHaveCount(0, { timeout: 60_000 })

    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Lixeira' })).toBeVisible()
    const deleted = trashRow(page, title)
    await expect(deleted).toBeVisible()
    await deleted.getByRole('button', { name: 'Restaurar' }).click()
    await expect(deleted).toHaveCount(0)

    await peerPage.goto('/recipes')
    await expect(peerPage.getByRole('button', { name: `Abrir ${title}` })).toBeVisible({ timeout: 60_000 })

    await page.goto('/recipes')
    await page.getByRole('button', { name: `Abrir ${title}` }).click()
    await softDeleteCurrentRecipe(page)
    await peerPage.reload({ waitUntil: 'domcontentloaded' })
    await expect(peerPage.getByRole('button', { name: `Abrir ${title}` })).toHaveCount(0, { timeout: 60_000 })

    await page.goto('/settings')
    const finalRow = trashRow(page, title)
    await expect(finalRow).toBeVisible()
    await finalRow.getByRole('button', { name: 'Excluir definitivamente' }).click()
    const dialog = page.getByRole('dialog', { name: new RegExp(`Excluir.*${title}.*definitivamente`) })

    for (let attempt = 0; attempt < 6; attempt += 1) {
      await dialog.getByRole('button', { name: 'Excluir definitivamente' }).click()
      const pending = page.getByRole('alert').filter({ hasText: 'alteração local pendente' })
      if (await finalRow.count() === 0) break
      if (await pending.count()) {
        await page.waitForTimeout(1_500)
        continue
      }
      break
    }

    await expect(finalRow).toHaveCount(0, { timeout: 30_000 })
    await expect(page.getByText('Exclusão definitiva concluída.', { exact: false })).toBeVisible()
  } finally {
    await peerContext.close()
  }
})
