import { expect, test } from '@playwright/test'
import { signInStagingPair } from './helpers/auth'

const ROUTES = [
  ['/recipes', 'Receitas'],
  ['/planner', 'Planejar'],
  ['/shopping', 'Compras'],
  ['/history', 'Histórico'],
  ['/settings', 'Configurações'],
] as const

test('critical routes avoid horizontal overflow and keep keyboard focus visible', async ({ page }) => {
  await signInStagingPair(page)

  for (const [path, heading] of ROUTES) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  }

  await page.goto('/recipes')
  await page.locator('body').click({ position: { x: 2, y: 2 } })
  await page.keyboard.press('Tab')
  const focused = page.locator(':focus')
  await expect(focused).toHaveCount(1)
  const focusStyle = await focused.evaluate((element) => {
    const style = getComputedStyle(element)
    return { width: Number.parseFloat(style.outlineWidth), style: style.outlineStyle }
  })
  expect(focusStyle.style).not.toBe('none')
  expect(focusStyle.width).toBeGreaterThan(0)
})

test('planner modal receives focus, closes on Escape and restores trigger focus', async ({ page }) => {
  await signInStagingPair(page)
  await page.goto('/planner')
  await expect(page.getByRole('heading', { name: 'Planejar' })).toBeVisible()

  const trigger = page.getByRole('button', { name: 'Períodos' })
  await trigger.focus()
  await trigger.press('Enter')

  const dialog = page.getByRole('dialog', { name: 'Períodos das refeições' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
})
