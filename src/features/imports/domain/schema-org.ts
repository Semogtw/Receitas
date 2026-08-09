import {
  cleanOptionalText,
  emptyImportedRecipeDraft,
  parseImportedIngredient,
  uniqueWarnings,
  type ImportedRecipeDraft,
} from './normalize-import'

type JsonObject = Record<string, unknown>

const MAX_SEARCH_DEPTH = 16
const MAX_SEARCH_NODES = 2_000
const MAX_INSTRUCTION_DEPTH = 12

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function typeIncludesRecipe(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().toLocaleLowerCase('en-US') === 'recipe'
  if (!Array.isArray(value)) return false
  return value.some((entry) => typeof entry === 'string' && entry.trim().toLocaleLowerCase('en-US') === 'recipe')
}

function findRecipeNode(root: unknown): JsonObject | null {
  const stack: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }]
  let visited = 0

  while (stack.length > 0 && visited < MAX_SEARCH_NODES) {
    const current = stack.shift()!
    visited += 1
    if (current.depth > MAX_SEARCH_DEPTH) continue

    if (Array.isArray(current.value)) {
      for (const child of current.value) stack.push({ value: child, depth: current.depth + 1 })
      continue
    }

    if (!isObject(current.value)) continue
    if (typeIncludesRecipe(current.value['@type'])) return current.value

    if (Array.isArray(current.value['@graph'])) {
      for (const child of current.value['@graph']) stack.push({ value: child, depth: current.depth + 1 })
    }
  }

  return null
}

function firstText(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const text = firstText(entry)
      if (text) return text
    }
    return null
  }
  return cleanOptionalText(value)
}

function httpUrl(value: unknown): string | null {
  const text = cleanOptionalText(value)
  if (!text) return null
  try {
    const url = new URL(text)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

function firstImageUrl(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const url = firstImageUrl(entry)
      if (url) return url
    }
    return null
  }
  if (typeof value === 'string') return httpUrl(value)
  if (!isObject(value)) return null
  return httpUrl(value.url) ?? httpUrl(value.contentUrl)
}

function durationMinutes(value: unknown): number | null {
  const text = cleanOptionalText(value)
  if (!text) return null
  const match = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(text)
  if (!match) return null

  const days = Number(match[1] ?? 0)
  const hours = Number(match[2] ?? 0)
  const minutes = Number(match[3] ?? 0)
  const seconds = Number(match[4] ?? 0)
  const total = days * 24 * 60 + hours * 60 + minutes + seconds / 60
  return Number.isFinite(total) && total >= 0 ? total : null
}

function ingredientLines(value: unknown): string[] {
  const entries = Array.isArray(value) ? value : [value]
  return entries.flatMap((entry) => {
    const text = cleanOptionalText(entry)
    return text ? [text] : []
  })
}

function instructionText(value: unknown, depth = 0): string[] {
  if (depth > MAX_INSTRUCTION_DEPTH) return []
  if (Array.isArray(value)) return value.flatMap((entry) => instructionText(entry, depth + 1))

  const direct = cleanOptionalText(value)
  if (direct) return [direct]
  if (!isObject(value)) return []

  const type = firstText(value['@type'])?.toLocaleLowerCase('en-US') ?? ''
  if (type === 'howtosection' || value.itemListElement !== undefined) {
    return instructionText(value.itemListElement, depth + 1)
  }

  const text = cleanOptionalText(value.text) ?? cleanOptionalText(value.name)
  return text ? [text] : []
}

function sourceFromNode(node: JsonObject, explicitSourceUrl: string | null): string | null {
  if (explicitSourceUrl) return httpUrl(explicitSourceUrl)
  return httpUrl(node.url)
}

export function parseSchemaOrgRecipeValue(
  value: unknown,
  sourceUrl: string | null = null,
): ImportedRecipeDraft | null {
  const node = findRecipeNode(value)
  if (!node) return null

  const draft = emptyImportedRecipeDraft(sourceFromNode(node, sourceUrl))
  const warnings: string[] = []
  const rawIngredients = ingredientLines(node.recipeIngredient ?? node.ingredients)
  const steps = instructionText(node.recipeInstructions)

  draft.title = firstText(node.name) ?? firstText(node.headline)
  draft.description = firstText(node.description)
  draft.servings = firstText(node.recipeYield)
  draft.prepTimeMinutes = durationMinutes(node.prepTime)
  draft.cookTimeMinutes = durationMinutes(node.cookTime)
  draft.ingredients = rawIngredients.map(parseImportedIngredient)
  draft.steps = steps.map((instruction) => ({ instruction }))
  draft.imageUrl = firstImageUrl(node.image)

  if (!draft.title) warnings.push('Título não encontrado no JSON-LD.')
  if (rawIngredients.length === 0) warnings.push('Nenhum ingrediente foi encontrado no JSON-LD.')
  if (steps.length === 0) warnings.push('Nenhuma etapa de preparo foi encontrada no JSON-LD.')
  if (node.prepTime !== undefined && draft.prepTimeMinutes === null) {
    warnings.push('Tempo de preparo do JSON-LD não usa uma duração ISO-8601 reconhecida.')
  }
  if (node.cookTime !== undefined && draft.cookTimeMinutes === null) {
    warnings.push('Tempo de cozimento do JSON-LD não usa uma duração ISO-8601 reconhecida.')
  }
  if (node.image !== undefined && draft.imageUrl === null) {
    warnings.push('Imagem do JSON-LD não contém uma URL HTTP(S) reconhecida.')
  }

  draft.warnings = uniqueWarnings(warnings)
  return draft
}

export function parseSchemaOrgRecipeJsonLd(
  jsonText: string,
  sourceUrl: string | null = null,
): ImportedRecipeDraft | null {
  let value: unknown
  try {
    value = JSON.parse(jsonText) as unknown
  } catch {
    return null
  }
  return parseSchemaOrgRecipeValue(value, sourceUrl)
}
