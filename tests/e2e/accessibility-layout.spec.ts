import { expect, test } from '@playwright/test'
import { signInStagingPair } from './helpers/auth'

const ROUTES = [
  ['/recipes', 'Receitas'],
  ['/planner', 'Planejar'],
  ['/shopping', 'Compras'],
  ['/history', 'Histórico'],
  ['/settings', 'Configurações'],
] as const

function cssDurationListToMilliseconds(value: string): number[] {
  return value.split(',').map((part) => {
    const duration = part.trim()
    if (duration.endsWith('ms')) return Number.parseFloat(duration)
    if (duration.endsWith('s')) return Number.parseFloat(duration) * 1000
    throw new Error(`Duração CSS inesperada: ${duration}`)
  })
}

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

test('reduced-motion preference suppresses nonessential motion without hiding controls', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await signInStagingPair(page)
  await page.goto('/recipes')

  const createRecipe = page.getByRole('button', { name: 'Nova receita' }).first()
  await expect(createRecipe).toBeVisible()

  const motionStyle = await createRecipe.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      animationDuration: style.animationDuration,
      transitionDuration: style.transitionDuration,
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    }
  })

  expect(cssDurationListToMilliseconds(motionStyle.animationDuration).every((duration) => duration <= 0.01)).toBe(true)
  expect(cssDurationListToMilliseconds(motionStyle.transitionDuration).every((duration) => duration <= 0.01)).toBe(true)
  expect(motionStyle.scrollBehavior).toBe('auto')

  // Reduced motion must suppress animation, not functionality or focusability.
  await createRecipe.focus()
  await expect(createRecipe).toBeFocused()
  await createRecipe.press('Enter')
  await expect(page.getByRole('heading', { name: 'Nova receita' })).toBeVisible()
})
