import { describe, expect, it } from 'vitest'
import { parseImportedIngredient } from './normalize-import'

describe('parseImportedIngredient', () => {
  it('parses mixed fractions and accented multi-word units', () => {
    expect(parseImportedIngredient('1 1/2 colheres de chá de canela')).toEqual({
      raw: '1 1/2 colheres de chá de canela',
      parsed: {
        amount: { kind: 'numeric', value: { numerator: 3, denominator: 2 } },
        unit: 'colheres de chá',
        name: 'canela',
        note: null,
      },
    })
  })

  it('extracts a trailing parenthesized note without dropping the raw line', () => {
    expect(parseImportedIngredient('2 tomates (sem sementes)')).toEqual({
      raw: '2 tomates (sem sementes)',
      parsed: {
        amount: { kind: 'numeric', value: { numerator: 2, denominator: 1 } },
        unit: null,
        name: 'tomates',
        note: 'sem sementes',
      },
    })
  })

  it('keeps lines without a numeric prefix completely raw', () => {
    expect(parseImportedIngredient('sal a gosto')).toEqual({ raw: 'sal a gosto' })
  })
})
