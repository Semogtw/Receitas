import { expect, test } from '@playwright/test'
import { signInStagingPair, requireDestructiveRestoreOptIn } from './helpers/auth'

async function exportCompleteBackup(page: import('@playwright/test').Page) {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Backup completo' })).toBeVisible()

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar backup completo' }).click()
  const artifact = await download
  const path = await artifact.path()
  if (!path) throw new Error('Playwright did not persist the complete backup download')
  expect(artifact.suggestedFilename()).toMatch(/^receitas-backup-.*\.zip$/)
  return { path, filename: artifact.suggestedFilename() }
}

test.beforeEach(async ({ page }) => {
  await signInStagingPair(page)
})

test('complete backup round-trips through merge without fabricating changes', async ({ page }) => {
  const backup = await exportCompleteBackup(page)

  const mergeSection = page.locator('section').filter({ hasText: 'Mesclar backup completo' }).first()
  await expect(mergeSection).toBeVisible()
  await mergeSection.locator('input[type="file"]').setInputFiles(backup.path)
  await mergeSection.getByRole('button', { name: 'Validar e preparar mesclagem' }).click()

  await expect(mergeSection.getByText('Preflight concluído.')).toBeVisible()
  await expect(mergeSection.getByText('Ainda nenhuma linha canônica foi alterada.')).toBeVisible()
  await mergeSection.getByRole('button', { name: 'Aplicar mesclagem agora' }).click()

  await expect(mergeSection.getByText('Mesclagem concluída.')).toBeVisible()
  const summary = mergeSection.locator('.backup-panel__result')
  await expect(summary).toContainText('0 inseridos')
  await expect(summary).toContainText('0 conflitos preservados')
})

test('replace_all cannot expose its destructive commit before a server-validated safety backup exists', async ({ page }) => {
  requireDestructiveRestoreOptIn()
  const backup = await exportCompleteBackup(page)

  const replaceSection = page.locator('section').filter({ hasText: 'Substituir tudo pelo backup' }).first()
  await expect(replaceSection).toBeVisible()
  await replaceSection.locator('input[type="file"]').setInputFiles(backup.path)

  await expect(replaceSection.getByRole('button', { name: '3. Substituir tudo agora' })).toHaveCount(0)
  await replaceSection.getByRole('button', { name: '1. Validar backup recebido' }).click()
  await expect(replaceSection.getByText('Backup recebido validado.')).toBeVisible()
  await expect(replaceSection.getByRole('button', { name: '3. Substituir tudo agora' })).toHaveCount(0)

  const safetyDownload = page.waitForEvent('download')
  await replaceSection.getByRole('button', { name: '2. Gerar e validar backup de segurança' }).click()
  await expect(replaceSection.getByText('Backup de segurança validado pelo servidor.')).toBeVisible()
  await replaceSection.getByRole('button', { name: /Baixar receitas-backup-.*\.zip/ }).click()
  const safetyArtifact = await safetyDownload
  expect(safetyArtifact.suggestedFilename()).toMatch(/^receitas-backup-.*\.zip$/)

  const destructive = replaceSection.getByRole('button', { name: '3. Substituir tudo agora' })
  await expect(destructive).toBeVisible()
  await destructive.click()
  await expect(replaceSection.getByText('Substituição concluída.')).toBeVisible()
})

test('invalid archive is rejected before canonical restore confirmation appears', async ({ page }, testInfo) => {
  const badPath = testInfo.outputPath('corrupt-final-entry.zip')
  await import('node:fs/promises').then((fs) => fs.writeFile(badPath, Buffer.from('not-a-zip-sensitive-fixture')))

  await page.goto('/settings')
  const mergeSection = page.locator('section').filter({ hasText: 'Mesclar backup completo' }).first()
  await mergeSection.locator('input[type="file"]').setInputFiles(badPath)
  await mergeSection.getByRole('button', { name: 'Validar e preparar mesclagem' }).click()

  await expect(mergeSection.getByRole('alert')).toBeVisible()
  await expect(mergeSection.getByRole('button', { name: 'Aplicar mesclagem agora' })).toHaveCount(0)
})
