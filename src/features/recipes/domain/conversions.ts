import { divideRational, multiplyRational, normalizeRational, parseAmount } from './amount'
import { DEFAULT_CONVERSION_PROFILES } from './default-conversion-profiles'
import type { ConversionProfile, IngredientAmount, Rational } from './types'

export type ConversionResult =
  | { status: 'converted'; amount: IngredientAmount; approximate: boolean }
  | { status: 'unavailable'; reason: 'unknown_ingredient_profile' | 'incompatible_units' | 'non_numeric_amount' }

export interface ConvertAmountInput {
  amount: IngredientAmount
  fromUnit: string
  toUnit: string
  ingredientKey?: string | null
  defaultProfiles?: readonly ConversionProfile[]
  pairOverrides?: readonly ConversionProfile[]
}

type UnitDimension = 'volume' | 'mass'

interface UnitDefinition {
  dimension: UnitDimension
  toBase: Rational
}

const UNIT_ALIASES: Record<string, string> = {
  ml: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  mililitro: 'ml',
  mililitros: 'ml',
  l: 'l',
  liter: 'l',
  liters: 'l',
  litro: 'l',
  litros: 'l',
  tsp: 'tsp',
  'colher de chá': 'tsp',
  'colheres de chá': 'tsp',
  tbsp: 'tbsp',
  'colher de sopa': 'tbsp',
  'colheres de sopa': 'tbsp',
  cup: 'cup',
  cups: 'cup',
  xícara: 'cup',
  xícaras: 'cup',
  xicara: 'cup',
  xicaras: 'cup',
  g: 'g',
  grama: 'g',
  gramas: 'g',
  kg: 'kg',
  quilograma: 'kg',
  quilogramas: 'kg',
}

const UNITS: Record<string, UnitDefinition> = {
  ml: { dimension: 'volume', toBase: { numerator: 1, denominator: 1 } },
  l: { dimension: 'volume', toBase: { numerator: 1000, denominator: 1 } },
  tsp: { dimension: 'volume', toBase: { numerator: 5, denominator: 1 } },
  tbsp: { dimension: 'volume', toBase: { numerator: 15, denominator: 1 } },
  cup: { dimension: 'volume', toBase: { numerator: 240, denominator: 1 } },
  g: { dimension: 'mass', toBase: { numerator: 1, denominator: 1 } },
  kg: { dimension: 'mass', toBase: { numerator: 1000, denominator: 1 } },
}

function canonicalUnit(value: string): string | null {
  return UNIT_ALIASES[value.trim().toLocaleLowerCase('pt-BR')] ?? null
}

function decimalNumberToRational(value: number): Rational {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Conversion density must be a finite number greater than zero')
  }
  const amount = parseAmount(String(value))
  if (amount.kind !== 'numeric') {
    throw new Error('Conversion density must use a decimal representation')
  }
  return amount.value
}

function convertWithinDimension(value: Rational, from: UnitDefinition, to: UnitDefinition): Rational {
  const inBase = multiplyRational(value, from.toBase)
  return divideRational(inBase, to.toBase)
}

function findDensityProfile(input: ConvertAmountInput): ConversionProfile | null {
  const ingredientKey = input.ingredientKey?.trim().toLocaleLowerCase('pt-BR')
  if (!ingredientKey) return null

  const pair = input.pairOverrides?.find(
    (profile) => profile.ingredientKey.trim().toLocaleLowerCase('pt-BR') === ingredientKey,
  )
  if (pair) return pair

  const defaults = input.defaultProfiles ?? DEFAULT_CONVERSION_PROFILES
  return defaults.find(
    (profile) => profile.ingredientKey.trim().toLocaleLowerCase('pt-BR') === ingredientKey,
  ) ?? null
}

export function convertAmount(input: ConvertAmountInput): ConversionResult {
  if (input.amount.kind !== 'numeric') {
    return { status: 'unavailable', reason: 'non_numeric_amount' }
  }

  const fromKey = canonicalUnit(input.fromUnit)
  const toKey = canonicalUnit(input.toUnit)
  if (!fromKey || !toKey) {
    if (input.fromUnit.trim().toLocaleLowerCase('pt-BR') === input.toUnit.trim().toLocaleLowerCase('pt-BR')) {
      return { status: 'converted', amount: input.amount, approximate: false }
    }
    return { status: 'unavailable', reason: 'incompatible_units' }
  }

  const from = UNITS[fromKey]!
  const to = UNITS[toKey]!
  const value = normalizeRational(input.amount.value)

  if (from.dimension === to.dimension) {
    return {
      status: 'converted',
      amount: { kind: 'numeric', value: convertWithinDimension(value, from, to) },
      approximate: false,
    }
  }

  const profile = findDensityProfile(input)
  if (!profile) return { status: 'unavailable', reason: 'unknown_ingredient_profile' }
  const density = decimalNumberToRational(profile.gramsPerMilliliter)

  let converted: Rational
  if (from.dimension === 'volume' && to.dimension === 'mass') {
    const milliliters = multiplyRational(value, from.toBase)
    const grams = multiplyRational(milliliters, density)
    converted = divideRational(grams, to.toBase)
  } else if (from.dimension === 'mass' && to.dimension === 'volume') {
    const grams = multiplyRational(value, from.toBase)
    const milliliters = divideRational(grams, density)
    converted = divideRational(milliliters, to.toBase)
  } else {
    return { status: 'unavailable', reason: 'incompatible_units' }
  }

  return {
    status: 'converted',
    amount: { kind: 'numeric', value: converted },
    approximate: true,
  }
}
