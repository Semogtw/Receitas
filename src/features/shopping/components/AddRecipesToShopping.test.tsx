import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RecipeSummary } from '../../recipes/data/recipe-repository'
import type { ConsolidatedShoppingItem } from '../domain/types'
import { AddRecipesToShopping } from './AddRecipesToShopping'

const recipe: RecipeSummary = {
  id: '40000000-0000-4000-8000-000000000004',
  title: 'Bolo',
  description: null,
  favorite: false,
  wantToMake: false,
  baseYield: { numerator: 4, denominator: 1 },
  baseYieldUnit: 'porções',
  prepTimeSeconds: null,
  cookTimeSeconds: null,
  totalTimeSeconds: null,
  updatedAt: '2026-08-08T12:00:00.000Z',
}
const previewItem: ConsolidatedShoppingItem = {
  name: 'Farinha',
  normalizedName: 'farinha',
  amount: { kind: 'numeric', value: { numerator: 2, denominator: 1 } },
  unit: 'xícara',
  source: { kind: 'recipe', recipeId: recipe.id },
  sources: [{ kind: 'recipe', recipeId: recipe.id }],
  approximate: false,
}

describe('AddRecipesToShopping', () => {
  it('builds a recipe preview with requested servings and confirms an editable result', async () => {
    const user = userEvent.setup()
    const onBuildRecipePreview = vi.fn(async () => [previewItem])
    const onConfirm = vi.fn(async () => undefined)
    const onClose = vi.fn()
    render(
      <AddRecipesToShopping
        listName="Mercado"
        recipes={[recipe]}
        onBuildRecipePreview={onBuildRecipePreview}
        onBuildPlannerPreview={vi.fn(async () => [])}
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    )

    await user.click(screen.getByRole('checkbox', { name: 'Bolo' }))
    await user.type(screen.getByLabelText('Porções'), '6')
    await user.click(screen.getByRole('button', { name: 'Montar prévia' }))

    expect(onBuildRecipePreview).toHaveBeenCalledWith([{
      recipeId: recipe.id,
      servings: { numerator: 6, denominator: 1 },
    }])
    expect(screen.getByRole('heading', { name: 'Prévia consolidada' })).toBeTruthy()

    const amountInput = screen.getByLabelText('Quantidade')
    await user.clear(amountInput)
    await user.type(amountInput, '2 1/2')
    await user.click(screen.getByRole('button', { name: 'Adicionar 1 à lista' }))

    expect(onConfirm).toHaveBeenCalledWith([{
      ...previewItem,
      amount: { kind: 'numeric', value: { numerator: 5, denominator: 2 } },
    }])
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('builds a preview from a planner date range', async () => {
    const user = userEvent.setup()
    const onBuildPlannerPreview = vi.fn(async () => [previewItem])
    render(
      <AddRecipesToShopping
        listName="Mercado"
        recipes={[recipe]}
        onBuildRecipePreview={vi.fn(async () => [])}
        onBuildPlannerPreview={onBuildPlannerPreview}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Planejamento' }))
    const dateInputs = screen.getAllByDisplayValue(/^\d{4}-\d{2}-\d{2}$/)
    await user.clear(dateInputs[0]!)
    await user.type(dateInputs[0]!, '2026-08-10')
    await user.clear(dateInputs[1]!)
    await user.type(dateInputs[1]!, '2026-08-12')
    await user.click(screen.getByRole('button', { name: 'Montar prévia' }))

    expect(onBuildPlannerPreview).toHaveBeenCalledWith({ start: '2026-08-10', end: '2026-08-12' })
  })

  it('allows removing a consolidated item before confirmation', async () => {
    const user = userEvent.setup()
    render(
      <AddRecipesToShopping
        listName="Mercado"
        recipes={[recipe]}
        onBuildRecipePreview={vi.fn(async () => [previewItem])}
        onBuildPlannerPreview={vi.fn(async () => [])}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('checkbox', { name: 'Bolo' }))
    await user.click(screen.getByRole('button', { name: 'Montar prévia' }))
    await user.click(screen.getByRole('button', { name: 'Remover' }))

    expect(screen.queryByRole('heading', { name: 'Prévia consolidada' })).toBeNull()
  })
})
