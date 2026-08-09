import { describe, expect, it } from 'vitest'
import type { RecipeIngredient } from '../../recipes/domain/types'
import { generateShoppingItems } from './generate-items'

const recipeId = '40000000-0000-4000-8000-000000000004'
const plannerEntryId = '60000000-0000-4000-8000-000000000006'

function ingredient(overrides: Partial<RecipeIngredient> = {}): RecipeIngredient {
  return {
    id: '41000000-0000-4000-8000-000000000001',
    recipeId,
    position: 0,
    amount: { kind: 'numeric', value: { numerator: 1, denominator: 2 } },
    unit: 'kg',
    name: 'Farinha',
    normalizedName: 'farinha',
    note: null,
    isApproximate: false,
    isOptional: false,
    ...overrides,
  }
}

describe('generateShoppingItems', () => {
  it('scales each ingredient before returning raw shopping drafts', () => {
    const result = generateShoppingItems([{
      recipeId,
      ingredients: [ingredient()],
      baseServings: { numerator: 2, denominator: 1 },
      requestedServings: { numerator: 6, denominator: 1 },
      source: { kind: 'recipe', recipeId },
    }])

    expect(result).toEqual([{
      name: 'Farinha',
      normalizedName: 'farinha',
      amount: { kind: 'numeric', value: { numerator: 3, denominator: 2 } },
      unit: 'kg',
      source: { kind: 'recipe', recipeId },
    }])
  })

  it('preserves text quantities and notes for human review', () => {
    const result = generateShoppingItems([{
      recipeId,
      ingredients: [ingredient({
        amount: { kind: 'text', text: 'a gosto' },
        unit: null,
        name: 'Sal',
        normalizedName: 'sal',
        note: 'fino',
      })],
      baseServings: { numerator: 2, denominator: 1 },
      requestedServings: { numerator: 4, denominator: 1 },
      source: { kind: 'recipe', recipeId },
    }])

    expect(result[0]).toMatchObject({
      name: 'Sal — fino',
      normalizedName: 'sal',
      amount: { kind: 'text', text: 'a gosto' },
      unit: null,
    })
  })

  it('supports planner-origin selections while retaining the meal entry reference', () => {
    const result = generateShoppingItems([{
      recipeId,
      ingredients: [ingredient()],
      baseServings: { numerator: 2, denominator: 1 },
      requestedServings: null,
      source: { kind: 'planner', recipeId, mealPlanEntryId: plannerEntryId },
    }])

    expect(result[0]?.source).toEqual({ kind: 'planner', recipeId, mealPlanEntryId: plannerEntryId })
  })

  it('refuses requested serving scaling when a recipe has no base serving amount', () => {
    expect(() => generateShoppingItems([{
      recipeId,
      ingredients: [ingredient()],
      baseServings: null,
      requestedServings: { numerator: 3, denominator: 1 },
      source: { kind: 'recipe', recipeId },
    }])).toThrow('Cannot scale a recipe without base servings')
  })
})
