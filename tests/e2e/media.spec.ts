import { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'
import { signInStagingPair } from './helpers/auth'

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

function fixtureTitle(): string {
  return `E2E mídia ${crypto.randomUUID()}`
}

test('photo added offline survives reload and reaches a fresh browser context after reconnect', async ({ page, context, browser }) => {
  const title = fixtureTitle()
  const caption = `Foto E2E ${crypto.randomUUID()}`

  await signInStagingPair(page)
  await page.getByRole('button', { name: 'Nova receita' }).first().click()
  await page.getByLabel('Título').fill(title)
  await page.getByRole('button', { name: 'Salvar receita' }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()

  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service worker indisponível para o gate de mídia offline')
    await navigator.serviceWorker.ready
  })

  await context.setOffline(true)
  try {
    await page.getByLabel('Foto').setInputFiles({
      name: 'fixture.png',
      mimeType: 'image/png',
      buffer: ONE_PIXEL_PNG,
    })
    const captionInput = page.getByLabel('Legenda (opcional)')
    if (await captionInput.count()) await captionInput.fill(caption)
    await page.getByRole('button', { name: 'Adicionar foto' }).click()

    await expect(page.getByText(caption)).toBeVisible({ timeout: 15_000 })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Receitas' })).toBeVisible()
    await page.getByRole('button', { name: `Abrir ${title}` }).click()
    await expect(page.getByText(caption)).toBeVisible({ timeout: 15_000 })
  } finally {
    await context.setOffline(false)
  }

  // Wait for the normal media upload runner + metadata mutation/sync. A fresh
  // context cannot see the first browser's Cache Storage, so seeing the caption
  // there proves that the remote object/metadata path completed.
  const origin = new URL(page.url()).origin
  const peerContext = await browser.newContext({ baseURL: origin })
  const peerPage = await peerContext.newPage()
  try {
    await signInStagingPair(peerPage)
    const recipe = peerPage.getByRole('button', { name: `Abrir ${title}` })
    await expect(recipe).toBeVisible({ timeout: 60_000 })
    await recipe.click()
    await expect(peerPage.getByText(caption)).toBeVisible({ timeout: 60_000 })
    await expect(peerPage.getByRole('img', { name: new RegExp(caption, 'i') })).toBeVisible({ timeout: 30_000 })

    await peerPage.getByRole('button', { name: 'Mover para a lixeira' }).click()
    await peerPage.getByRole('dialog').getByRole('button', { name: 'Mover para a lixeira' }).click()
    await expect(peerPage.getByRole('heading', { name: 'Receitas' })).toBeVisible()
  } finally {
    await peerContext.close()
  }
})
