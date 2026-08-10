import { expect, test } from '@playwright/test'
import { signInStagingPair } from './helpers/auth'

test.describe('authenticated release surface', () => {
  test.beforeEach(async ({ page }) => {
    await signInStagingPair(page)
  })

  test('deep links for the private application routes remain reachable', async ({ page }) => {
    const routes = [
      ['/recipes', 'Receitas'],
      ['/planner', 'Planejar'],
      ['/shopping', 'Compras'],
      ['/history', 'Histórico'],
      ['/settings', 'Configurações'],
    ] as const

    for (const [path, heading] of routes) {
      await page.goto(path)
      await expect(page).toHaveURL(new RegExp(`${path.replace('/', '\\/')}(?:$|[?#])`))
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible()
    }
  })

  test('settings exposes complete backup, both restore modes and exceptional account recovery', async ({ page }) => {
    await page.goto('/settings')

    await expect(page.getByRole('heading', { name: 'Backup completo' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Mesclar backup completo' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Substituir tudo pelo backup' })).toBeVisible()
    await expect(page.getByText('Recuperação excepcional de identidade', { exact: true })).toBeVisible()
  })

  test('app shell carries privacy metadata in the emitted document', async ({ page }) => {
    await page.goto('/recipes')

    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /nofollow/)
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer')
  })

  test('service worker is registered for the private PWA shell', async ({ page }) => {
    await page.goto('/recipes')
    const scope = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) throw new Error('Service workers are not supported in this browser project')
      const registration = await navigator.serviceWorker.ready
      return registration.scope
    })

    expect(scope).toContain('/')
  })
})

test('replacement completion callback is public to the invited authenticated link and not swallowed by AuthGate', async ({ page }) => {
  await page.goto('/auth/finish-replacement')

  await expect(page).toHaveURL(/\/auth\/finish-replacement(?:$|[?#])/)
  await expect(page.getByRole('heading', { name: 'Concluir substituição de identidade' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText(/convite de recuperação|sessão/i)
})
