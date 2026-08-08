import { describe, expect, it } from 'vitest'
import { convertAmount } from './conversions'
import type { ConversionProfile, IngredientAmount } from './types'

const numeric = (numerator: number, denominator = 1): IngredientAmount => ({
  kind: 'numeric',
  value: { numerator, denominator },
})

describe('culinary conversions', () => {
  it('converts volume units using exact culinary factors', () => {
    expect(convertAmount({ amount: numeric(1000), fromUnit: 'ml', toUnit: 'l' })).toEqual({
      status: 'converted', amount: numeric(1), approximate: false,
    })
    expect(convertAmount({ amount: numeric(2), fromUnit: 'tbsp', toUnit: 'tsp' })).toEqual({
      status: 'converted', amount: numeric(6), approximate: false,
    })
    expect(convertAmount({ amount: numeric(1), fromUnit: 'cup', toUnit: 'tbsp' })).toEqual({
      status: 'converted', amount: numeric(16), approximate: false,
    })
  })

  it('converts metric mass units exactly', () => {
    expect(convertAmount({ amount: numeric(1000), fromUnit: 'g', toUnit: 'kg' })).toEqual({
      status: 'converted', amount: numeric(1), approximate: false,
    })
  })

  it('requires an ingredient profile for mass-volume conversion and marks it approximate', () => {
    const defaults: ConversionProfile[] = [
      { ingredientKey: 'agua', gramsPerMilliliter: 1, source: 'default' },
    ]

    expect(convertAmount({
      amount: numeric(1), fromUnit: 'cup', toUnit: 'g', ingredientKey: 'agua', defaultProfiles: defaults,
    })).toEqual({
      status: 'converted', amount: numeric(240), approximate: true,
    })

    expect(convertAmount({
      amount: numeric(1), fromUnit: 'cup', toUnit: 'g', ingredientKey: 'ingrediente-desconhecido', defaultProfiles: defaults,
    })).toEqual({ status: 'unavailable', reason: 'unknown_ingredient_profile' })
  })

  it('prefers a pair override over a default density profile', () => {
    const defaults: ConversionProfile[] = [
      { ingredientKey: 'farinha', gramsPerMilliliter: 0.5, source: 'default' },
    ]
    const pairOverrides: ConversionProfile[] = [
      { ingredientKey: 'farinha', gramsPerMilliliter: 0.625, source: 'pair_override' },
    ]

    expect(convertAmount({
      amount: numeric(1), fromUnit: 'cup', toUnit: 'g', ingredientKey: 'farinha', defaultProfiles: defaults, pairOverrides,
    })).toEqual({
      status: 'converted', amount: numeric(150), approximate: true,
    })
  })

  it('does not invent conversions for text amounts or incompatible units', () => {
    expect(convertAmount({ amount: { kind: 'text', text: 'a gosto' }, fromUnit: 'g', toUnit: 'kg' }))
      .toEqual({ status: 'unavailable', reason: 'non_numeric_amount' })
    expect(convertAmount({ amount: numeric(1), fromUnit: 'unit', toUnit: 'g' }))
      .toEqual({ status: 'unavailable', reason: 'incompatible_units' })
  })
})
