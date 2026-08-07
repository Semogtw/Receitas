import { expect, test } from '@playwright/test'

test('primary shell routes are reachable', async ({ page }) => {
  await page.goto('/recipes')
  await expect(page.getByRole('heading', { name: 'Receitas' })).toBeVisible()

  await page.getByRole('link', { name: 'Planejar' }).click()
  await expect(page).toHaveURL(/\/planner$/)
  await expect(page.getByRole('heading', { name: 'Planejar' })).toBeVisible()

  await page.getByRole('link', { name: 'Compras' }).click()
  await expect(page).toHaveURL(/\/shopping$/)
  await expect(page.getByRole('heading', { name: 'Compras' })).toBeVisible()
})

test('application shell reloads after the service worker is ready and network goes offline', async ({ page, context }) => {
  await page.goto('/recipes')
  await expect(page.getByRole('heading', { name: 'Receitas' })).toBeVisible()

  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service workers are not supported in this browser project')
    }
    await navigator.serviceWorker.ready
  })

  await context.setOffline(true)
  try {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Receitas' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible()
  } finally {
    await context.setOffline(false)
  }
})
