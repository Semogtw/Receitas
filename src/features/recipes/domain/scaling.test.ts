import { describe, expect, it } from 'vitest'
import type { RecipeIngredient } from './types'
import { scaleIngredient, scaleRecipeIngredients, servingMultiplier } from './scaling'

const ingredient: RecipeIngredient = {
  id: 'ingredient-1',
  recipeId: 'recipe-1',
  position: 0,
  amount: { kind: 'numeric', value: { numerator: 3, denominator: 2 } },
  unit: 'xícara',
  name: 'Farinha',
  normalizedName: 'farinha',
  note: null,
  isApproximate: true,
  isOptional: false,
}

describe('recipe serving scaling', () => {
  it('scales numeric quantities by exact rational multipliers without changing editing flags', () => {
    const half = scaleIngredient(ingredient, { numerator: 1, denominator: 2 })
    expect(half.amount).toEqual({
      kind: 'numeric', value: { numerator: 3, denominator: 4 },
    })
    expect(half).toMatchObject({ isApproximate: true, isOptional: false })
    expect(scaleIngredient(ingredient, { numerator: 3, denominator: 2 }).amount).toEqual({
      kind: 'numeric', value: { numerator: 9, denominator: 4 },
    })
    expect(scaleIngredient(ingredient, { numerator: 2, denominator: 1 }).amount).toEqual({
      kind: 'numeric', value: { numerator: 3, denominator: 1 },
    })
  })

  it('leaves text and absent quantities semantically unchanged', () => {
    const text = { ...ingredient, amount: { kind: 'text' as const, text: 'a gosto' } }
    const none = { ...ingredient, amount: { kind: 'none' as const } }

    expect(scaleIngredient(text, { numerator: 2, denominator: 1 })).toBe(text)
    expect(scaleIngredient(none, { numerator: 2, denominator: 1 })).toBe(none)
  })

  it('derives a target-serving multiplier without mutating source ingredients', () => {
    const items = [ingredient]
    const multiplier = servingMultiplier({ numerator: 6, denominator: 1 }, { numerator: 4, denominator: 1 })
    const scaled = scaleRecipeIngredients(items, multiplier)

    expect(multiplier).toEqual({ numerator: 3, denominator: 2 })
    expect(scaled[0]?.amount).toEqual({ kind: 'numeric', value: { numerator: 9, denominator: 4 } })
    expect(items[0]?.amount).toEqual({ kind: 'numeric', value: { numerator: 3, denominator: 2 } })
  })

  it('rejects a zero or negative source serving amount', () => {
    expect(() => servingMultiplier({ numerator: 2, denominator: 1 }, { numerator: 0, denominator: 1 })).toThrow('greater than zero')
    expect(() => servingMultiplier({ numerator: 2, denominator: 1 }, { numerator: -2, denominator: 1 })).toThrow('greater than zero')
  })
})
