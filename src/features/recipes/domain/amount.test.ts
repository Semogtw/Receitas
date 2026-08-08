import { describe, expect, it } from 'vitest'
import {
  deserializeIngredientAmount,
  formatAmount,
  normalizeRational,
  parseAmount,
  serializeIngredientAmount,
} from './amount'

describe('recipe amount domain', () => {
  it('parses fractions and mixed fractions exactly', () => {
    expect(parseAmount('1/2')).toEqual({ kind: 'numeric', value: { numerator: 1, denominator: 2 } })
    expect(parseAmount('1 1/2')).toEqual({ kind: 'numeric', value: { numerator: 3, denominator: 2 } })
  })

  it('parses pt-BR decimals without floating-point canonicalization', () => {
    expect(parseAmount('0,5')).toEqual({ kind: 'numeric', value: { numerator: 1, denominator: 2 } })
    expect(parseAmount('1,25')).toEqual({ kind: 'numeric', value: { numerator: 5, denominator: 4 } })
  })

  it('keeps culinary free text and empty amounts distinct', () => {
    expect(parseAmount('a gosto')).toEqual({ kind: 'text', text: 'a gosto' })
    expect(parseAmount('  ')).toEqual({ kind: 'none' })
  })

  it('normalizes signs, reduces fractions and rejects invalid integer invariants', () => {
    expect(normalizeRational({ numerator: 6, denominator: -8 })).toEqual({ numerator: -3, denominator: 4 })
    expect(normalizeRational({ numerator: 0, denominator: 99 })).toEqual({ numerator: 0, denominator: 1 })
    expect(() => normalizeRational({ numerator: 1, denominator: 0 })).toThrow('denominator')
    expect(() => normalizeRational({ numerator: Number.MAX_SAFE_INTEGER + 1, denominator: 2 })).toThrow('safe integer')
  })

  it('formats exact mixed fractions for display', () => {
    expect(formatAmount({ kind: 'numeric', value: { numerator: 3, denominator: 2 } })).toBe('1 1/2')
    expect(formatAmount({ kind: 'numeric', value: { numerator: 1, denominator: 2 } })).toBe('1/2')
    expect(formatAmount({ kind: 'numeric', value: { numerator: 4, denominator: 2 } })).toBe('2')
    expect(formatAmount({ kind: 'text', text: 'a gosto' })).toBe('a gosto')
    expect(formatAmount({ kind: 'none' })).toBe('')
  })

  it('serializes numeric, text and empty quantities without ambiguous persistence states', () => {
    expect(serializeIngredientAmount({ kind: 'numeric', value: { numerator: 3, denominator: 2 } })).toEqual({
      quantityNum: 3,
      quantityDen: 2,
      quantityText: null,
    })
    expect(serializeIngredientAmount({ kind: 'text', text: 'a gosto' })).toEqual({
      quantityNum: null,
      quantityDen: null,
      quantityText: 'a gosto',
    })
    expect(serializeIngredientAmount({ kind: 'none' })).toEqual({
      quantityNum: null,
      quantityDen: null,
      quantityText: null,
    })
  })

  it('deserializes valid persistence states and rejects contradictory rows', () => {
    expect(deserializeIngredientAmount({ quantityNum: 3, quantityDen: 2, quantityText: null })).toEqual({
      kind: 'numeric', value: { numerator: 3, denominator: 2 },
    })
    expect(deserializeIngredientAmount({ quantityNum: null, quantityDen: null, quantityText: 'a gosto' })).toEqual({
      kind: 'text', text: 'a gosto',
    })
    expect(deserializeIngredientAmount({ quantityNum: null, quantityDen: null, quantityText: null })).toEqual({ kind: 'none' })
    expect(() => deserializeIngredientAmount({ quantityNum: 1, quantityDen: null, quantityText: null })).toThrow('together')
    expect(() => deserializeIngredientAmount({ quantityNum: 1, quantityDen: 2, quantityText: 'xícara' })).toThrow('both')
  })
})
