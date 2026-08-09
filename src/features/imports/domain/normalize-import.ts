import { parseAmount } from '../../recipes/domain/amount'
import type { IngredientAmount } from '../../recipes/domain/types'

export interface ImportedIngredientDraft {
  raw: string
  parsed?: {
    amount: IngredientAmount
    unit: string | null
    name: string
    note: string | null
  }
}

export interface ImportedRecipeDraft {
  title: string | null
  description: string | null
  sourceUrl: string | null
  servings: string | null
  prepTimeMinutes: number | null
  cookTimeMinutes: number | null
  ingredients: ImportedIngredientDraft[]
  steps: Array<{ instruction: string }>
  imageUrl: string | null
  warnings: string[]
}

const KNOWN_UNITS = new Set([
  'g', 'grama', 'gramas', 'kg', 'quilo', 'quilos', 'quilograma', 'quilogramas',
  'ml', 'mililitro', 'mililitros', 'l', 'litro', 'litros',
  'xicara', 'xicaras', 'copo', 'copos',
  'colher', 'colheres', 'colher de sopa', 'colheres de sopa',
  'colher de cha', 'colheres de cha', 'chavena', 'chavenas',
  'tsp', 'tbsp', 'cup', 'cups', 'oz', 'lb',
  'pacote', 'pacotes', 'lata', 'latas', 'caixa', 'caixas',
  'dente', 'dentes', 'fatia', 'fatias', 'unidade', 'unidades',
])

const QUANTITY_PREFIX = /^([+-]?\d+\s+\d+\s*\/\s*\d+|[+-]?\d+\s*\/\s*[+-]?\d+|[+-]?\d+[,.]\d+|[+-]?\d+)\b\s*(.*)$/u

function normalizeComparison(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function splitTrailingNote(value: string): { name: string; note: string | null } {
  const parenthesized = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(value)
  if (parenthesized) {
    return { name: parenthesized[1]!.trim(), note: parenthesized[2]!.trim() || null }
  }

  const commaIndex = value.indexOf(',')
  if (commaIndex > 0) {
    const name = value.slice(0, commaIndex).trim()
    const note = value.slice(commaIndex + 1).trim()
    if (name && note) return { name, note }
  }

  return { name: value.trim(), note: null }
}

function extractUnit(remainder: string): { unit: string | null; ingredientText: string } {
  const normalizedRemainder = remainder.trim()
  if (!normalizedRemainder) return { unit: null, ingredientText: '' }

  const words = normalizedRemainder.split(/\s+/)
  const candidates = [3, 2, 1]
  for (const count of candidates) {
    if (words.length <= count) continue
    const candidate = words.slice(0, count).join(' ')
    if (!KNOWN_UNITS.has(normalizeComparison(candidate))) continue
    return {
      unit: candidate,
      ingredientText: words.slice(count).join(' ').replace(/^de\s+/i, '').trim(),
    }
  }

  return { unit: null, ingredientText: normalizedRemainder }
}

export function parseImportedIngredient(rawValue: string): ImportedIngredientDraft {
  const raw = rawValue.trim()
  if (!raw) return { raw: rawValue }

  const quantity = QUANTITY_PREFIX.exec(raw)
  if (!quantity) return { raw }

  const amount = parseAmount(quantity[1]!)
  if (amount.kind !== 'numeric') return { raw }

  const { unit, ingredientText } = extractUnit(quantity[2]!)
  const { name, note } = splitTrailingNote(ingredientText)
  if (!name) return { raw }

  return {
    raw,
    parsed: {
      amount,
      unit,
      name,
      note,
    },
  }
}

export function emptyImportedRecipeDraft(sourceUrl: string | null = null): ImportedRecipeDraft {
  return {
    title: null,
    description: null,
    sourceUrl,
    servings: null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    ingredients: [],
    steps: [],
    imageUrl: null,
    warnings: [],
  }
}

export function cleanOptionalText(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value !== 'string') return null
  const text = value.replace(/\s+/g, ' ').trim()
  return text || null
}

export function uniqueWarnings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}
