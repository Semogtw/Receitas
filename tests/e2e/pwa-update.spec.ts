import { expect, test, type Page } from '@playwright/test'
import { signInStagingPair } from './helpers/auth'

const REAL_UPDATE_GATE_ENABLED = process.env.E2E_PWA_UPDATE === '1'
const UPDATE_WAIT_MS = 180_000

function uniqueRecipeTitle(): string {
  return `E2E atualização PWA ${crypto.randomUUID()}`
}

async function ensureServiceWorkerControlsPage(page: Page): Promise<void> {
  const controlled = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service worker indisponível para o gate de atualização PWA')
    await navigator.serviceWorker.ready
    return Boolean(navigator.serviceWorker.controller)
  })

  if (controlled) return

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect
    .poll(
      () => page.evaluate(() => Boolean(navigator.serviceWorker?.controller)),
      { timeout: 15_000, message: 'A página deve ficar sob controle do service worker antes do teste de atualização' },
    )
    .toBe(true)
}

async function serviceWorkerNetworkDigest(page: Page): Promise<string> {
  return page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service worker indisponível')
    const registration = await navigator.serviceWorker.ready
    const scriptUrl = registration.active?.scriptURL
    if (!scriptUrl) throw new Error('Nenhum service worker ativo encontrado')

    const response = await fetch(scriptUrl, { cache: 'no-store' })
    if (!response.ok) throw new Error(`Falha ao buscar service worker: HTTP ${response.status}`)
    const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer())
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  })
}

async function requestServiceWorkerUpdate(page: Page): Promise<void> {
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service worker indisponível')
    const registration = await navigator.serviceWorker.ready
    await registration.update()
  })
}

test('pending local recipe survives accepting a real same-origin PWA update', async ({ page, context, browser }) => {
  test.skip(
    !REAL_UPDATE_GATE_ENABLED,
    'Defina E2E_PWA_UPDATE=1 somente durante um deploy coordenado de uma nova versão no mesmo origin de staging.',
  )
  test.setTimeout(240_000)

  const title = uniqueRecipeTitle()
  await signInStagingPair(page)
  await expect(page.getByRole('heading', { name: 'Receitas' })).toBeVisible()
  await ensureServiceWorkerControlsPage(page)

  const initialWorkerDigest = await serviceWorkerNetworkDigest(page)

  await context.setOffline(true)
  try {
    await page.getByRole('button', { name: 'Nova receita' }).first().click()
    await expect(page.getByRole('heading', { name: 'Nova receita' })).toBeVisible()
    await page.getByLabel('Título').fill(title)
    await page.getByRole('button', { name: 'Salvar receita' }).click()
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
  } finally {
    await context.setOffline(false)
  }

  const updateBanner = page.getByText('Nova versão disponível', { exact: true })
  await expect
    .poll(
      async () => {
        await requestServiceWorkerUpdate(page)
        return updateBanner.isVisible()
      },
      {
        timeout: UPDATE_WAIT_MS,
        intervals: [1_000, 2_000, 5_000],
        message: 'Uma nova versão deve ser implantada no mesmo origin enquanto este gate está aberto',
      },
    )
    .toBe(true)

  const waitingWorkerDigest = await serviceWorkerNetworkDigest(page)
  expect(waitingWorkerDigest, 'o sw.js servido pelo origin deve pertencer a uma build realmente nova').not.toBe(initialWorkerDigest)

  const mainFrameReload = page.waitForEvent('framenavigated', {
    predicate: (frame) => frame === page.mainFrame(),
    timeout: 30_000,
  })
  await page.getByRole('button', { name: 'Atualizar agora' }).click()
  await mainFrameReload

  // Reaching the locally-created recipe after the controlling worker changes is
  // the release invariant: an accepted PWA update must not discard persisted
  // local PowerSync state even when the mutation originated offline.
  await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 30_000 })

  const origin = new URL(page.url()).origin
  const peerContext = await browser.newContext({ baseURL: origin })
  const peerPage = await peerContext.newPage()

  try {
    await signInStagingPair(peerPage)
    const remoteRecipe = peerPage.getByRole('button', { name: `Abrir ${title}` })
    await expect(remoteRecipe).toBeVisible({ timeout: 45_000 })

    await remoteRecipe.click()
    await expect(peerPage.getByRole('heading', { name: title })).toBeVisible()
    await peerPage.getByRole('button', { name: 'Mover para a lixeira' }).click()
    await expect(peerPage.getByRole('dialog')).toContainText(title)
    await peerPage.getByRole('dialog').getByRole('button', { name: 'Mover para a lixeira' }).click()
    await expect(peerPage.getByRole('heading', { name: 'Receitas' })).toBeVisible()
  } finally {
    await peerContext.close()
  }
})
