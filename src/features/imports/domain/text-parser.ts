import {
  emptyImportedRecipeDraft,
  parseImportedIngredient,
  uniqueWarnings,
  type ImportedRecipeDraft,
} from './normalize-import'

type Section = 'preamble' | 'ingredients' | 'preparation'

const INGREDIENT_HEADERS = new Set([
  'ingrediente',
  'ingredientes',
  'ingredients',
])

const PREPARATION_HEADERS = new Set([
  'preparo',
  'preparacao',
  'preparação',
  'modo de preparo',
  'modo de fazer',
  'instrucoes',
  'instruções',
  'instructions',
  'directions',
])

function normalizeHeader(value: string): string {
  return value
    .trim()
    .replace(/[:\-–—]+$/u, '')
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function sectionForHeader(line: string): Exclude<Section, 'preamble'> | null {
  const normalized = normalizeHeader(line)
  if (INGREDIENT_HEADERS.has(normalized)) return 'ingredients'
  if (PREPARATION_HEADERS.has(normalized)) return 'preparation'
  return null
}

function stripListMarker(value: string): string {
  return value
    .trim()
    .replace(/^[-*•▪◦]\s*/u, '')
    .replace(/^\d+[.)]\s+/u, '')
    .trim()
}

function usefulLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

export function parsePastedRecipeText(text: string): ImportedRecipeDraft {
  const draft = emptyImportedRecipeDraft(null)
  const lines = usefulLines(text)
  const warnings: string[] = []

  if (lines.length === 0) {
    draft.warnings = ['Nenhum conteúdo útil foi encontrado no texto colado.']
    return draft
  }

  const preamble: string[] = []
  const ingredientLines: string[] = []
  const preparationLines: string[] = []
  let section: Section = 'preamble'
  let foundIngredientHeader = false
  let foundPreparationHeader = false

  for (const line of lines) {
    const header = sectionForHeader(line)
    if (header) {
      section = header
      if (header === 'ingredients') foundIngredientHeader = true
      else foundPreparationHeader = true
      continue
    }

    if (section === 'ingredients') ingredientLines.push(stripListMarker(line))
    else if (section === 'preparation') preparationLines.push(stripListMarker(line))
    else preamble.push(line)
  }

  if (preamble.length > 0) {
    draft.title = preamble[0] ?? null
    const description = preamble.slice(1).join(' ').replace(/\s+/g, ' ').trim()
    draft.description = description || null
  } else {
    warnings.push('Título não identificado no texto colado.')
  }

  if (!foundIngredientHeader) {
    warnings.push('Seção de ingredientes não identificada; revise o conteúdo manualmente.')
  }
  if (!foundPreparationHeader) {
    warnings.push('Seção de preparo não identificada; revise o conteúdo manualmente.')
  }

  draft.ingredients = ingredientLines
    .filter(Boolean)
    .map(parseImportedIngredient)
  draft.steps = preparationLines
    .filter(Boolean)
    .map((instruction) => ({ instruction }))

  const rawIngredientCount = draft.ingredients.filter((ingredient) => !ingredient.parsed).length
  if (rawIngredientCount > 0) {
    warnings.push(`${rawIngredientCount} ${rawIngredientCount === 1 ? 'ingrediente ficou' : 'ingredientes ficaram'} em formato bruto para revisão.`)
  }

  if (foundIngredientHeader && draft.ingredients.length === 0) {
    warnings.push('A seção de ingredientes está vazia.')
  }
  if (foundPreparationHeader && draft.steps.length === 0) {
    warnings.push('A seção de preparo está vazia.')
  }

  draft.warnings = uniqueWarnings(warnings)
  return draft
}
