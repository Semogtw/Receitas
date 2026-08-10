import { expect, test, type Page } from '@playwright/test'
import { signInStagingPair } from './helpers/auth'

function fixture(prefix: string): string {
  return `${prefix} ${crypto.randomUUID()}`
}

async function createRecipe(page: Page, title: string, ingredient: string): Promise<void> {
  await page.goto('/recipes')
  await expect(page.getByRole('heading', { name: 'Receitas' })).toBeVisible()
  await page.getByRole('button', { name: 'Nova receita' }).first().click()
  await page.getByLabel('Título').fill(title)
  await page.getByRole('button', { name: 'Adicionar ingrediente' }).click()
  await page.getByLabel('Quantidade do ingrediente 1').fill('2')
  await page.getByLabel('Unidade do ingrediente 1').fill('un')
  await page.getByLabel('Nome do ingrediente 1').fill(ingredient)
  await page.getByRole('button', { name: 'Salvar receita' }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}

async function createPeriodAndPlan(page: Page, recipeTitle: string, periodName: string): Promise<void> {
  await page.goto('/planner')
  await expect(page.getByRole('heading', { name: 'Planejar' })).toBeVisible()

  await page.getByRole('button', { name: 'Períodos' }).click()
  const settings = page.getByRole('dialog', { name: 'Períodos das refeições' })
  await settings.getByLabel('Novo período').fill(periodName)
  await settings.getByRole('button', { name: 'Adicionar' }).click()
  await expect(settings.getByDisplayValue(periodName)).toBeVisible()
  await settings.getByRole('button', { name: 'Fechar configurações' }).click()

  await page.getByRole('button', { name: 'Refeição' }).click()
  const editor = page.getByRole('dialog', { name: 'Planejar refeição' })
  await editor.getByLabel('Receita').selectOption({ label: recipeTitle })
  await editor.getByLabel('Período').selectOption({ label: periodName })
  await editor.getByLabel('Porções opcionais').fill('2')
  await editor.getByRole('button', { name: 'Salvar planejamento' }).click()
  await expect(page.getByText(recipeTitle, { exact: true })).toBeVisible()
}

async function createShoppingList(page: Page, listName: string): Promise<void> {
  await page.goto('/shopping')
  await expect(page.getByRole('heading', { name: 'Compras' })).toBeVisible()
  await page.getByLabel('Nova lista').fill(listName)
  await page.getByRole('button', { name: 'Criar' }).click()
  await expect(page.getByRole('heading', { name: listName })).toBeVisible()

  const makeDefault = page.getByRole('button', { name: `Definir ${listName} como lista padrão` })
  if (await makeDefault.count()) await makeDefault.click()
  await expect(page.getByText('Lista padrão', { exact: true })).toBeVisible()
}

test('planner generates a shopping list that remains checkable offline and syncs after reconnect', async ({ page, context, browser }) => {
  const recipeTitle = fixture('E2E planner receita')
  const ingredient = fixture('Ingrediente E2E')
  const periodName = fixture('Período E2E')
  const listName = fixture('Lista E2E')

  await signInStagingPair(page)
  await createRecipe(page, recipeTitle, ingredient)
  await createPeriodAndPlan(page, recipeTitle, periodName)
  await createShoppingList(page, listName)

  await page.getByRole('button', { name: 'Gerar de receitas' }).click()
  const generator = page.getByRole('dialog', { name: new RegExp(`Gerar itens para ${listName}`) })
  await generator.getByRole('button', { name: 'Planejamento' }).click()
  await generator.getByRole('button', { name: 'Montar prévia' }).click()
  await expect(generator.getByDisplayValue(ingredient)).toBeVisible()
  await generator.getByRole('button', { name: /Adicionar \d+ à lista/ }).click()

  const itemCheckbox = page.getByRole('checkbox', { name: new RegExp(ingredient) })
  await expect(itemCheckbox).toBeVisible()
  await expect(itemCheckbox).not.toBeChecked()

  await context.setOffline(true)
  try {
    await itemCheckbox.check()
    await expect(itemCheckbox).toBeChecked()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Compras' })).toBeVisible()
    await expect(page.getByRole('heading', { name: listName })).toBeVisible()
    await expect(page.getByRole('checkbox', { name: new RegExp(ingredient) })).toBeChecked()
  } finally {
    await context.setOffline(false)
  }

  const origin = new URL(page.url()).origin
  const peerContext = await browser.newContext({ baseURL: origin })
  const peerPage = await peerContext.newPage()
  try {
    await signInStagingPair(peerPage)
    await peerPage.goto('/shopping')
    const listButton = peerPage.getByRole('button', { name: new RegExp(listName) })
    await expect(listButton).toBeVisible({ timeout: 60_000 })
    await listButton.click()
    await expect(peerPage.getByRole('checkbox', { name: new RegExp(ingredient) })).toBeChecked({ timeout: 60_000 })
  } finally {
    await peerContext.close()
  }

  // Cleanup is limited to this test's UUID-named fixtures.
  await page.goto('/shopping')
  await page.getByRole('button', { name: new RegExp(listName) }).click()
  await page.getByRole('button', { name: `Mover ${listName} para a lixeira` }).click()
  await expect(page.getByRole('button', { name: new RegExp(listName) })).toHaveCount(0)

  await page.goto('/planner')
  await page.getByRole('button', { name: `Remover ${recipeTitle} do planejamento` }).click()
  await expect(page.getByText(recipeTitle, { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Períodos' }).click()
  const settings = page.getByRole('dialog', { name: 'Períodos das refeições' })
  await settings.getByRole('button', { name: `Mover ${periodName} para a lixeira` }).click()
  await expect(settings.getByDisplayValue(periodName)).toHaveCount(0)
  await settings.getByRole('button', { name: 'Fechar configurações' }).click()

  await page.goto('/recipes')
  await page.getByRole('button', { name: `Abrir ${recipeTitle}` }).click()
  await page.getByRole('button', { name: 'Mover para a lixeira' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Mover para a lixeira' }).click()
  await expect(page.getByRole('button', { name: `Abrir ${recipeTitle}` })).toHaveCount(0)
})
