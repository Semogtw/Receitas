import { expect, test } from '@playwright/test'
import { signInStagingPair } from './helpers/auth'

function fixtureTitle(): string {
  return `E2E preparo ${crypto.randomUUID()}`
}

async function createRecipeWithOneStep(page: import('@playwright/test').Page, title: string): Promise<void> {
  await page.getByRole('button', { name: 'Nova receita' }).first().click()
  await page.getByLabel('Título').fill(title)

  const addStep = page.getByRole('button', { name: /Adicionar etapa/i })
  if (await addStep.count()) await addStep.click()

  const stepTextarea = page.locator('textarea').last()
  await stepTextarea.fill('Misture os ingredientes até ficar uniforme.')
  await page.getByRole('button', { name: 'Salvar receita' }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}

test('starts and finishes a cooking session from recipe detail', async ({ page }) => {
  const title = fixtureTitle()
  await signInStagingPair(page)
  await expect(page.getByRole('heading', { name: 'Receitas' })).toBeVisible()
  await createRecipeWithOneStep(page, title)

  await page.getByRole('button', { name: 'Cozinhar agora' }).click()
  await expect(page.getByText('Misture os ingredientes até ficar uniforme.')).toBeVisible()

  const start = page.getByRole('button', { name: 'Começar preparo' })
  if (await start.count()) await start.click()

  const finishStep = page.getByRole('button', { name: /Finalizar preparo/i })
  await expect(finishStep).toBeVisible()
  await finishStep.click()

  await expect(page.getByRole('button', { name: 'Encerrar e registrar' })).toBeVisible()
  const observation = page.getByLabel('Observação compartilhada')
  if (await observation.count()) await observation.fill('Fixture E2E sem conteúdo pessoal.')
  await page.getByRole('button', { name: 'Encerrar e registrar' }).click()

  await expect(page.getByRole('heading', { name: 'Histórico atualizado' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Fotos.*preparo/i })).toBeVisible()

  await page.getByRole('button', { name: 'Voltar à receita' }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await page.getByRole('button', { name: 'Mover para a lixeira' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Mover para a lixeira' }).click()
  await expect(page.getByRole('heading', { name: 'Receitas' })).toBeVisible()
})
