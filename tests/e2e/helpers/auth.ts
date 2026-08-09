import { expect, type Page } from '@playwright/test'

function requiredEnv(name: 'E2E_EMAIL' | 'E2E_PASSWORD'): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required for authenticated Receitas E2E. Configure a dedicated staging pair identity; never use production credentials.`)
  }
  return value
}

export async function signInStagingPair(page: Page): Promise<void> {
  const email = requiredEnv('E2E_EMAIL')
  const password = requiredEnv('E2E_PASSWORD')

  await page.goto('/login')
  const emailInput = page.locator('input[type="email"]').first()
  const passwordInput = page.locator('input[type="password"]').first()
  await expect(emailInput).toBeVisible()
  await expect(passwordInput).toBeVisible()
  await emailInput.fill(email)
  await passwordInput.fill(password)
  await page.locator('form button[type="submit"]').first().click()
  await expect(page).toHaveURL(/\/recipes(?:$|[?#])/)
}

export function requireDestructiveRestoreOptIn(): void {
  if (process.env.E2E_DESTRUCTIVE_RESTORE !== '1') {
    throw new Error('E2E_DESTRUCTIVE_RESTORE=1 is required for replace_all acceptance because this test intentionally mutates the dedicated staging pair.')
  }
}
