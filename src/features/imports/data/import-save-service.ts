import type { PowerSyncDatabase } from '@powersync/web'
import { createMutationEnvelope, type JsonObject, type MutationEnvelope } from '../../../data/mutations/types'
import { performLocalMutation } from '../../../data/mutations/performLocalMutation'
import { resolveMutationBase } from '../../../data/mutations/resolveMutationBase'
import { RecipeRepository, type RecipeDraft } from '../../recipes/data/recipe-repository'
import { parseAmount } from '../../recipes/domain/amount'
import type { IngredientAmount, Rational } from '../../recipes/domain/types'
import type { ImportStrategy } from './import-client'
import { parseImportedIngredient, type ImportedRecipeDraft } from '../domain/normalize-import'

interface DatabaseRow extends Record<string, unknown> { id: string }

interface RecipeCreator {
  createRecipe(draft: RecipeDraft): Promise<string>
}

type MutationWriter = (database: PowerSyncDatabase, envelope: MutationEnvelope) => Promise<string>

export interface ImportSaveScope {
  pairId: string
  actorUserId: string
}

function payloadFromRow(row: DatabaseRow): JsonObject {
  const payload: JsonObject = {}
  for (const [key, value] of Object.entries(row)) {
    if (key === 'id' || value === undefined) continue
    payload[key] = value as JsonObject[string]
  }
  return payload
}

function parseReviewedServings(value: string | null): { yield: Rational | null; unit: string | null } {
  const text = value?.trim() ?? ''
  if (!text) return { yield: null, unit: null }

  const match = /^([+-]?\d+\s+\d+\s*\/\s*\d+|[+-]?\d+\s*\/\s*[+-]?\d+|[+-]?\d+[,.]\d+|[+-]?\d+)\s*(.*)$/u.exec(text)
  if (!match) return { yield: null, unit: null }

  try {
    const amount = parseAmount(match[1]!)
    if (amount.kind !== 'numeric' || amount.value.numerator <= 0) return { yield: null, unit: null }
    return {
      yield: amount.value,
      unit: match[2]!.trim() || 'porções',
    }
  } catch {
    return { yield: null, unit: null }
  }
}

function ingredientAmount(raw: string, parsedAmount: IngredientAmount | undefined): IngredientAmount {
  if (parsedAmount) return parsedAmount
  const reparsed = parseImportedIngredient(raw)
  return reparsed.parsed?.amount ?? { kind: 'none' }
}

function validatedImportedSourceUrl(value: string | null, strategy: ImportStrategy): string | null {
  if (strategy === 'pasted_text') return null
  const text = value?.trim() ?? ''
  if (!text || text.length > 4_096) throw new Error('Imported URL source is invalid')
  try {
    const url = new URL(text)
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
      throw new Error('Imported URL source is invalid')
    }
    return url.href
  } catch {
    throw new Error('Imported URL source is invalid')
  }
}

function validatedMinutes(value: number | null, label: string): number | null {
  if (value === null) return null
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a non-negative finite number`)
  return Math.round(value * 60)
}

export function buildRecipeDraftFromImport(imported: ImportedRecipeDraft): RecipeDraft {
  const title = imported.title?.trim() ?? ''
  if (!title) throw new Error('Imported recipe title is required before saving')

  const servings = parseReviewedServings(imported.servings)

  return {
    id: crypto.randomUUID(),
    title,
    description: imported.description?.trim() || null,
    baseYield: servings.yield,
    baseYieldUnit: servings.unit,
    prepTimeSeconds: validatedMinutes(imported.prepTimeMinutes, 'Imported prep time'),
    cookTimeSeconds: validatedMinutes(imported.cookTimeMinutes, 'Imported cook time'),
    favorite: false,
    wantToMake: false,
    ingredients: imported.ingredients.flatMap((ingredient) => {
      const raw = ingredient.raw.trim()
      if (!raw) return []
      const reparsed = ingredient.parsed ?? parseImportedIngredient(raw).parsed
      return [{
        id: crypto.randomUUID(),
        amount: ingredientAmount(raw, reparsed?.amount),
        unit: reparsed?.unit ?? null,
        name: reparsed?.name?.trim() || raw,
        note: reparsed?.note?.trim() || null,
        isApproximate: false,
        isOptional: false,
      }]
    }),
    steps: imported.steps.flatMap((step) => {
      const instruction = step.instruction.trim()
      return instruction ? [{
        id: crypto.randomUUID(),
        instruction,
        durationSeconds: null,
        note: null,
      }] : []
    }),
  }
}

export class ImportSaveService {
  private readonly recipes: RecipeCreator

  constructor(
    private readonly database: PowerSyncDatabase,
    private readonly scope: ImportSaveScope,
    recipes?: RecipeCreator,
    private readonly writeMutation: MutationWriter = performLocalMutation,
  ) {
    this.recipes = recipes ?? new RecipeRepository(database, scope)
  }

  async save(imported: ImportedRecipeDraft, strategy: ImportStrategy): Promise<string> {
    const sourceUrl = validatedImportedSourceUrl(imported.sourceUrl, strategy)
    const draft = buildRecipeDraftFromImport(imported)
    await this.recipes.createRecipe(draft)

    const row = await this.database.getOptional<DatabaseRow>(
      'SELECT * FROM recipes WHERE id = ? AND pair_id = ? LIMIT 1',
      [draft.id, this.scope.pairId],
    )
    if (!row) throw new Error('Imported recipe was created locally but its source metadata could not be attached')

    const current = payloadFromRow(row)
    const base = await resolveMutationBase(this.database, 'recipes', draft.id, current)
    const sourceKind = strategy === 'pasted_text' ? 'text' : 'url'
    await this.writeMutation(this.database, createMutationEnvelope({
      pairId: this.scope.pairId,
      actorUserId: this.scope.actorUserId,
      entityType: 'recipes',
      entityId: draft.id,
      operation: 'update',
      ...base,
      next: {
        ...current,
        source_kind: sourceKind,
        source_url: sourceUrl,
        updated_at: new Date().toISOString(),
      },
    }))

    return draft.id
  }
}
