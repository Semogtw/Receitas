import type { IngredientAmount, PersistedIngredientAmount, Rational } from './types'

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER)

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer`)
  }
}

function gcd(a: number, b: number): number {
  let left = Math.abs(a)
  let right = Math.abs(b)
  while (right !== 0) {
    const next = left % right
    left = right
    right = next
  }
  return left || 1
}

function gcdBigInt(a: bigint, b: bigint): bigint {
  let left = a < 0n ? -a : a
  let right = b < 0n ? -b : b
  while (right !== 0n) {
    const next = left % right
    left = right
    right = next
  }
  return left || 1n
}

function fromBigIntRational(numerator: bigint, denominator: bigint): Rational {
  if (denominator === 0n) throw new Error('Rational denominator must not be zero')
  if (denominator < 0n) {
    numerator = -numerator
    denominator = -denominator
  }

  const divisor = gcdBigInt(numerator, denominator)
  numerator /= divisor
  denominator /= divisor

  const absoluteNumerator = numerator < 0n ? -numerator : numerator
  if (absoluteNumerator > MAX_SAFE_BIGINT || denominator > MAX_SAFE_BIGINT) {
    throw new Error('Rational result exceeds safe integer range')
  }

  return { numerator: Number(numerator), denominator: Number(denominator) }
}

export function normalizeRational(value: Rational): Rational {
  assertSafeInteger(value.numerator, 'Rational numerator')
  assertSafeInteger(value.denominator, 'Rational denominator')
  if (value.denominator === 0) throw new Error('Rational denominator must not be zero')
  if (value.numerator === 0) return { numerator: 0, denominator: 1 }

  const sign = value.denominator < 0 ? -1 : 1
  const divisor = gcd(value.numerator, value.denominator)
  return {
    numerator: (value.numerator / divisor) * sign,
    denominator: Math.abs(value.denominator / divisor),
  }
}

function parseInteger(value: string): number {
  const parsed = Number(value)
  assertSafeInteger(parsed, 'Parsed quantity')
  return parsed
}

function parseDecimal(value: string): Rational {
  const normalized = value.replace(',', '.')
  const match = normalized.match(/^([+-]?)(\d+)\.(\d+)$/)
  if (!match) throw new Error('Invalid decimal quantity')

  const [, signToken, whole, fraction] = match
  const sign = signToken === '-' ? -1n : 1n
  const digits = BigInt(`${whole}${fraction}`)
  const denominator = 10n ** BigInt(fraction.length)
  return fromBigIntRational(sign * digits, denominator)
}

export function parseAmount(input: string): IngredientAmount {
  const text = input.trim()
  if (!text) return { kind: 'none' }

  const mixed = text.match(/^([+-]?\d+)\s+(\d+)\s*\/\s*(\d+)$/)
  if (mixed) {
    const wholeToken = mixed[1]!
    const denominator = BigInt(mixed[3]!)
    if (denominator === 0n) throw new Error('Rational denominator must not be zero')
    const wholeMagnitude = BigInt(wholeToken.replace(/^[+-]/, ''))
    const fractionNumerator = BigInt(mixed[2]!)
    const sign = wholeToken.startsWith('-') ? -1n : 1n
    return {
      kind: 'numeric',
      value: fromBigIntRational(sign * (wholeMagnitude * denominator + fractionNumerator), denominator),
    }
  }

  const fraction = text.match(/^([+-]?\d+)\s*\/\s*([+-]?\d+)$/)
  if (fraction) {
    return {
      kind: 'numeric',
      value: normalizeRational({
        numerator: parseInteger(fraction[1]!),
        denominator: parseInteger(fraction[2]!),
      }),
    }
  }

  if (/^[+-]?\d+[,.]\d+$/.test(text)) {
    return { kind: 'numeric', value: parseDecimal(text) }
  }

  if (/^[+-]?\d+$/.test(text)) {
    return { kind: 'numeric', value: normalizeRational({ numerator: parseInteger(text), denominator: 1 }) }
  }

  return { kind: 'text', text }
}

export function formatAmount(amount: IngredientAmount): string {
  if (amount.kind === 'none') return ''
  if (amount.kind === 'text') return amount.text

  const { numerator, denominator } = normalizeRational(amount.value)
  if (denominator === 1) return String(numerator)

  const sign = numerator < 0 ? '-' : ''
  const absoluteNumerator = Math.abs(numerator)
  const whole = Math.floor(absoluteNumerator / denominator)
  const remainder = absoluteNumerator % denominator

  if (whole === 0) return `${sign}${remainder}/${denominator}`
  if (remainder === 0) return `${sign}${whole}`
  return `${sign}${whole} ${remainder}/${denominator}`
}

export function serializeIngredientAmount(amount: IngredientAmount): PersistedIngredientAmount {
  if (amount.kind === 'none') {
    return { quantityNum: null, quantityDen: null, quantityText: null }
  }
  if (amount.kind === 'text') {
    return { quantityNum: null, quantityDen: null, quantityText: amount.text }
  }

  const value = normalizeRational(amount.value)
  return { quantityNum: value.numerator, quantityDen: value.denominator, quantityText: null }
}

export function deserializeIngredientAmount(row: PersistedIngredientAmount): IngredientAmount {
  const hasNumerator = row.quantityNum !== null
  const hasDenominator = row.quantityDen !== null
  const hasText = row.quantityText !== null

  if (hasNumerator !== hasDenominator) {
    throw new Error('Quantity numerator and denominator must be present together')
  }
  if (hasNumerator && hasText) {
    throw new Error('Quantity cannot contain both numeric and text representations')
  }
  if (hasNumerator && hasDenominator) {
    return {
      kind: 'numeric',
      value: normalizeRational({ numerator: row.quantityNum!, denominator: row.quantityDen! }),
    }
  }
  if (hasText) return { kind: 'text', text: row.quantityText! }
  return { kind: 'none' }
}

export function multiplyRational(left: Rational, right: Rational): Rational {
  const a = normalizeRational(left)
  const b = normalizeRational(right)
  return fromBigIntRational(
    BigInt(a.numerator) * BigInt(b.numerator),
    BigInt(a.denominator) * BigInt(b.denominator),
  )
}

export function divideRational(dividend: Rational, divisor: Rational): Rational {
  const left = normalizeRational(dividend)
  const right = normalizeRational(divisor)
  if (right.numerator === 0) throw new Error('Cannot divide by a zero rational')
  return fromBigIntRational(
    BigInt(left.numerator) * BigInt(right.denominator),
    BigInt(left.denominator) * BigInt(right.numerator),
  )
}
