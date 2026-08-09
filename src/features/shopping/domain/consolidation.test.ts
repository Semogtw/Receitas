import { describe, expect, it } from 'vitest'
import type { ShoppingItemDraft } from './types'
import { consolidateShoppingItems } from './consolidation'

const recipeA = '40000000-0000-4000-8000-000000000001'
const recipeB = '40000000-0000-4000-8000-000000000002'

function numeric(
  name: string,
  normalizedName: string,
  numerator: number,
  denominator: number,
  unit: string | null,
  recipeId: string,
): ShoppingItemDraft {
  return {
    name,
    normalizedName,
    amount: { kind: 'numeric', value: { numerator, denominator } },
    unit,
    source: { kind: 'recipe', recipeId },
  }
}

describe('consolidateShoppingItems', () => {
  it('consolidates compatible mass units exactly', () => {
    const result = consolidateShoppingItems([
      numeric('Farinha', 'farinha', 500, 1, 'g', recipeA),
      numeric('farinha', 'farinha', 1, 1, 'kg', recipeB),
    ])

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      unit: 'g',
      amount: { kind: 'numeric', value: { numerator: 1500, denominator: 1 } },
      approximate: false,
    })
    expect(result[0]?.sources).toEqual([
      { kind: 'recipe', recipeId: recipeA },
      { kind: 'recipe', recipeId: recipeB },
    ])
  })

  it('consolidates compatible volume units exactly', () => {
    const result = consolidateShoppingItems([
      numeric('Água', 'agua', 250, 1, 'ml', recipeA),
      numeric('agua', 'agua', 1, 1, 'l', recipeB),
    ])

    expect(result).toHaveLength(1)
    expect(result[0]?.amount).toEqual({ kind: 'numeric', value: { numerator: 1250, denominator: 1 } })
    expect(result[0]?.approximate).toBe(false)
  })

  it('uses an explicit density profile for mass-volume consolidation and labels it approximate', () => {
    const result = consolidateShoppingItems([
      numeric('Leite', 'leite', 1000, 1, 'ml', recipeA),
      numeric('leite', 'leite', 103, 100, 'kg', recipeB),
    ], {
      pairOverrides: [{ ingredientKey: 'leite', gramsPerMilliliter: 1.03, source: 'pair_override' }],
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.amount).toEqual({ kind: 'numeric', value: { numerator: 2000, denominator: 1 } })
    expect(result[0]?.unit).toBe('ml')
    expect(result[0]?.approximate).toBe(true)
  })

  it('keeps mass and volume separate when no density profile is known', () => {
    const result = consolidateShoppingItems([
      numeric('Farinha', 'farinha', 500, 1, 'g', recipeA),
      numeric('farinha', 'farinha', 2, 1, 'cup', recipeB),
    ], { defaultProfiles: [] })

    expect(result).toHaveLength(2)
  })

  it('does not collapse text amounts because their meaning cannot be safely summed', () => {
    const first: ShoppingItemDraft = {
      name: 'Sal',
      normalizedName: 'sal',
      amount: { kind: 'text', text: 'a gosto' },
      unit: null,
      source: { kind: 'recipe', recipeId: recipeA },
    }
    const second = { ...first, source: { kind: 'recipe' as const, recipeId: recipeB } }

    const result = consolidateShoppingItems([first, second])

    expect(result).toHaveLength(2)
    expect(result.map((item) => item.amount)).toEqual([
      { kind: 'text', text: 'a gosto' },
      { kind: 'text', text: 'a gosto' },
    ])
  })

  it('preserves incompatible ingredient notes encoded in the display name', () => {
    const result = consolidateShoppingItems([
      numeric('Tomate — sem sementes', 'tomate', 2, 1, null, recipeA),
      numeric('Tomate — com sementes', 'tomate', 3, 1, null, recipeB),
    ])

    expect(result).toHaveLength(2)
  })

  it('sums unitless numeric ingredients without inventing a unit', () => {
    const result = consolidateShoppingItems([
      numeric('Ovo', 'ovo', 2, 1, null, recipeA),
      numeric('ovo', 'ovo', 3, 1, null, recipeB),
    ])

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      unit: null,
      amount: { kind: 'numeric', value: { numerator: 5, denominator: 1 } },
    })
  })
})
