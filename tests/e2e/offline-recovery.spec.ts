import { expect, test } from '@playwright/test'
import { signInStagingPair } from './helpers/auth'

function uniqueRecipeTitle(): string {
  return `E2E offline ${crypto.randomUUID()}`
}

test('offline-created recipe survives reload and syncs to a fresh browser context', async ({ page, context, browser }) => {
  const title = uniqueRecipeTitle()
  await signInStagingPair(page)
  await expect(page.getByRole('heading', { name: 'Receitas' })).toBeVisible()

  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service worker indisponível para o gate offline')
    await navigator.serviceWorker.ready
  })

  await context.setOffline(true)
  try {
    await page.getByRole('button', { name: 'Nova receita' }).first().click()
    await expect(page.getByRole('heading', { name: 'Nova receita' })).toBeVisible()
    await page.getByLabel('Título').fill(title)
    await page.getByRole('button', { name: 'Salvar receita' }).click()
    await expect(page.getByRole('heading', { name: title })).toBeVisible()

    // A full document reload exercises the persisted PowerSync database instead
    // of merely asserting React component state.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Receitas' })).toBeVisible()
    const localRecipe = page.getByRole('button', { name: `Abrir ${title}` })
    await expect(localRecipe).toBeVisible({ timeout: 15_000 })
    await localRecipe.click()
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
  } finally {
    await context.setOffline(false)
  }

  // A fresh browser context has a distinct local PowerSync database. Seeing the
  // recipe there proves the pending local mutation reached the remote sync path,
  // rather than merely surviving in the first context's IndexedDB.
  const origin = new URL(page.url()).origin
  const peerContext = await browser.newContext({ baseURL: origin })
  const peerPage = await peerContext.newPage()

  try {
    await signInStagingPair(peerPage)
    const remoteRecipe = peerPage.getByRole('button', { name: `Abrir ${title}` })
    await expect(remoteRecipe).toBeVisible({ timeout: 45_000 })

    // Clean up only the fixture created by this test. A failed cleanup is visible
    // as a test failure instead of silently accumulating staging data.
    await remoteRecipe.click()
    await expect(peerPage.getByRole('heading', { name: title })).toBeVisible()
    await peerPage.getByRole('button', { name: 'Mover para a lixeira' }).click()
    await expect(peerPage.getByRole('dialog')).toContainText(title)
    await peerPage.getByRole('dialog').getByRole('button', { name: 'Mover para a lixeira' }).click()
    await expect(peerPage.getByRole('heading', { name: 'Receitas' })).toBeVisible()
    await expect(peerPage.getByRole('button', { name: `Abrir ${title}` })).toHaveCount(0)
  } finally {
    await peerContext.close()
  }
})
