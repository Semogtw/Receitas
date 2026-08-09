import { normalizeRational } from '../../recipes/domain/amount'
import { convertAmount } from '../../recipes/domain/conversions'
import type { ConversionProfile, Rational } from '../../recipes/domain/types'
import type { ConsolidatedShoppingItem, ShoppingItemDraft } from './types'

export interface ShoppingConsolidationOptions {
  defaultProfiles?: readonly ConversionProfile[]
  pairOverrides?: readonly ConversionProfile[]
}

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER)

function fromBigIntRational(numerator: bigint, denominator: bigint): Rational {
  if (denominator === 0n) throw new Error('Shopping rational denominator must not be zero')
  if (denominator < 0n) {
    numerator = -numerator
    denominator = -denominator
  }

  const gcd = (leftValue: bigint, rightValue: bigint) => {
    let left = leftValue < 0n ? -leftValue : leftValue
    let right = rightValue < 0n ? -rightValue : rightValue
    while (right !== 0n) {
      const next = left % right
      left = right
      right = next
    }
    return left || 1n
  }

  const divisor = gcd(numerator, denominator)
  numerator /= divisor
  denominator /= divisor
  const absoluteNumerator = numerator < 0n ? -numerator : numerator
  if (absoluteNumerator > MAX_SAFE_BIGINT || denominator > MAX_SAFE_BIGINT) {
    throw new Error('Consolidated shopping amount exceeds safe integer range')
  }
  return { numerator: Number(numerator), denominator: Number(denominator) }
}

function addRational(leftValue: Rational, rightValue: Rational): Rational {
  const left = normalizeRational(leftValue)
  const right = normalizeRational(rightValue)
  return fromBigIntRational(
    BigInt(left.numerator) * BigInt(right.denominator)
      + BigInt(right.numerator) * BigInt(left.denominator),
    BigInt(left.denominator) * BigInt(right.denominator),
  )
}

function textKey(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function sameMeaning(left: ShoppingItemDraft, right: ShoppingItemDraft): boolean {
  return textKey(left.normalizedName) === textKey(right.normalizedName)
    && textKey(left.name) === textKey(right.name)
}

function asSingle(item: ShoppingItemDraft): ConsolidatedShoppingItem {
  return {
    ...item,
    sources: [item.source],
    approximate: false,
  }
}

function tryMerge(
  target: ConsolidatedShoppingItem,
  incoming: ShoppingItemDraft,
  options: ShoppingConsolidationOptions,
): ConsolidatedShoppingItem | null {
  if (!sameMeaning(target, incoming)) return null
  if (target.amount.kind !== 'numeric' || incoming.amount.kind !== 'numeric') return null

  if (target.unit === null || incoming.unit === null) {
    if (target.unit !== incoming.unit) return null
    return {
      ...target,
      amount: {
        kind: 'numeric',
        value: addRational(target.amount.value, incoming.amount.value),
      },
      sources: [...target.sources, incoming.source],
    }
  }

  const conversion = convertAmount({
    amount: incoming.amount,
    fromUnit: incoming.unit,
    toUnit: target.unit,
    ingredientKey: incoming.normalizedName,
    defaultProfiles: options.defaultProfiles,
    pairOverrides: options.pairOverrides,
  })
  if (conversion.status !== 'converted' || conversion.amount.kind !== 'numeric') return null

  return {
    ...target,
    amount: {
      kind: 'numeric',
      value: addRational(target.amount.value, conversion.amount.value),
    },
    sources: [...target.sources, incoming.source],
    approximate: target.approximate || conversion.approximate,
  }
}

export function consolidateShoppingItems(
  items: readonly ShoppingItemDraft[],
  options: ShoppingConsolidationOptions = {},
): ConsolidatedShoppingItem[] {
  const consolidated: ConsolidatedShoppingItem[] = []

  for (const item of items) {
    let merged = false
    for (let index = 0; index < consolidated.length; index += 1) {
      const candidate = consolidated[index]
      if (!candidate) continue
      const next = tryMerge(candidate, item, options)
      if (!next) continue
      consolidated[index] = next
      merged = true
      break
    }
    if (!merged) consolidated.push(asSingle(item))
  }

  return consolidated
}
