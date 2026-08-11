import { expect, test } from '@playwright/test'

test('signed-out shell renders login and guards private routes', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()
  await expect(page.getByText('Use uma das duas contas já autorizadas')).toBeVisible()

  await page.goto('/recipes')
  await expect(page).toHaveURL(/\/login(?:$|[?#])/)
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()
})

test('signed-out PWA shell survives a full offline reload after service worker activation', async ({ page, context }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()

  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service workers are required for the production PWA smoke gate')
    }
    await navigator.serviceWorker.ready
  })

  await context.setOffline(true)
  try {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  } finally {
    await context.setOffline(false)
  }
})
