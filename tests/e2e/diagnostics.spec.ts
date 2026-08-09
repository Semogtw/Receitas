import { expect, test } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { signInStagingPair } from './helpers/auth'

const SENTINEL = 'PRIVATE_RECIPE_TEXT_DO_NOT_EXPORT_91f27a'

test.beforeEach(async ({ page }) => {
  await signInStagingPair(page)
})

test('diagnostics export contains coarse technical failure data but not sensitive restore content', async ({ page }, testInfo) => {
  await page.goto('/settings')

  const invalidArchive = testInfo.outputPath(`${SENTINEL}.zip`)
  await writeFile(invalidArchive, Buffer.from(`not-a-zip\n${SENTINEL}\nuser@example.com\nBearer secret-token`))

  const mergeSection = page.locator('section').filter({ hasText: 'Mesclar backup completo' }).first()
  await mergeSection.locator('input[type="file"]').setInputFiles(invalidArchive)
  await mergeSection.getByRole('button', { name: 'Validar e preparar mesclagem' }).click()
  await expect(mergeSection.getByRole('alert')).toBeVisible()

  const diagnostics = page.locator('section').filter({ hasText: /Diagnósticos/i }).first()
  await expect(diagnostics).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await diagnostics.getByRole('button', { name: /Exportar/i }).first().click()
  const download = await downloadPromise
  const saved = testInfo.outputPath('diagnostics.json')
  await download.saveAs(saved)
  const exported = await readFile(saved, 'utf8')

  expect(exported).not.toContain(SENTINEL)
  expect(exported).not.toContain('user@example.com')
  expect(exported).not.toContain('secret-token')
  expect(exported).not.toContain(`${SENTINEL}.zip`)
  expect(exported).toMatch(/restore|backup/i)
})
