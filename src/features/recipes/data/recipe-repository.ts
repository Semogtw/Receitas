import type { PowerSyncDatabase } from '@powersync/web'
import { createMutationEnvelope, type JsonObject, type MutationEnvelope } from '../../../data/mutations/types'
import { performLocalMutation } from '../../../data/mutations/performLocalMutation'
import { resolveMutationBase } from '../../../data/mutations/resolveMutationBase'
import { normalizeRational, serializeIngredientAmount } from '../domain/amount'
import type { IngredientAmount, Rational } from '../domain/types'

export interface RecipeRepositoryScope {
  pairId: string
  actorUserId: string
}

export interface RecipeDraftIngredient {
  id: string
  amount: IngredientAmount
  unit: string | null
  name: string
  note: string | null
  isApproximate: boolean
  isOptional: boolean
}

export interface RecipeDraftStep {
  id: string
  instruction: string
  durationSeconds: number | null
  note: string | null
}

export interface RecipeDraft {
  id: string
  title: string
  description: string | null
  baseYield: Rational | null
  baseYieldUnit: string | null
  prepTimeSeconds: number | null
  cookTimeSeconds: number | null
  favorite: boolean
  wantToMake: boolean
  ingredients: RecipeDraftIngredient[]
  steps: RecipeDraftStep[]
}

interface RecipeRow extends Record<string, unknown> { id: string }
interface IngredientRow extends Record<string, unknown> { id: string }
interface StepRow extends Record<string, unknown> { id: string }

type MutationWriter = (database: PowerSyncDatabase, envelope: MutationEnvelope) => Promise<string>

function cleanText(value: string | null): string | null {
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed || null
}

function assertNonNegativeInteger(value: number | null, label: string): void {
  if (value === null) return
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`)
}

function assertPositiveInteger(value: number | null, label: string): void {
  if (value === null) return
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`)
}

function normalizeIngredientName(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function asJsonObject(row: Record<string, unknown>): JsonObject {
  const payload: JsonObject = {}
  for (const [key, value] of Object.entries(row)) {
    if (key === 'id') continue
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      Array.isArray(value) ||
      (typeof value === 'object' && value !== null)
    ) {
      payload[key] = value as JsonObject[string]
    }
  }
  return payload
}

function validateDraft(draft: RecipeDraft): void {
  if (!draft.title.trim()) throw new Error('Recipe title is required')
  if (draft.title.trim().length > 200) throw new Error('Recipe title must be at most 200 characters')
  assertNonNegativeInteger(draft.prepTimeSeconds, 'prepTimeSeconds')
  assertNonNegativeInteger(draft.cookTimeSeconds, 'cookTimeSeconds')

  if (draft.baseYield) {
    const normalized = normalizeRational(draft.baseYield)
    if (normalized.numerator <= 0) throw new Error('baseYield must be greater than zero')
  }

  const ids = new Set<string>()
  for (const ingredient of draft.ingredients) {
    if (!ingredient.name.trim()) throw new Error('Ingredient name is required')
    if (ids.has(ingredient.id)) throw new Error(`Duplicate recipe child id: ${ingredient.id}`)
    ids.add(ingredient.id)
  }
  for (const step of draft.steps) {
    if (!step.instruction.trim()) throw new Error('Recipe step instruction is required')
    assertPositiveInteger(step.durationSeconds, 'durationSeconds')
    if (ids.has(step.id)) throw new Error(`Duplicate recipe child id: ${step.id}`)
    ids.add(step.id)
  }
}

function totalTime(prep: number | null, cook: number | null): number | null {
  if (prep === null && cook === null) return null
  return (prep ?? 0) + (cook ?? 0)
}

function recipeCreatePayload(draft: RecipeDraft, scope: RecipeRepositoryScope, now: string): JsonObject {
  const baseYield = draft.baseYield ? normalizeRational(draft.baseYield) : null
  return {
    pair_id: scope.pairId,
    revision: 0,
    title: draft.title.trim(),
    description: cleanText(draft.description),
    base_yield_numerator: baseYield?.numerator ?? null,
    base_yield_denominator: baseYield?.denominator ?? null,
    base_yield_unit: cleanText(draft.baseYieldUnit),
    prep_time_seconds: draft.prepTimeSeconds,
    cook_time_seconds: draft.cookTimeSeconds,
    total_time_seconds: totalTime(draft.prepTimeSeconds, draft.cookTimeSeconds),
    favorite: draft.favorite ? 1 : 0,
    want_to_make: draft.wantToMake ? 1 : 0,
    source_kind: 'manual',
    source_url: null,
    created_by: scope.actorUserId,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  }
}

function recipeUpdatePayload(draft: RecipeDraft, current: JsonObject, now: string): JsonObject {
  const baseYield = draft.baseYield ? normalizeRational(draft.baseYield) : null
  return {
    ...current,
    title: draft.title.trim(),
    description: cleanText(draft.description),
    base_yield_numerator: baseYield?.numerator ?? null,
    base_yield_denominator: baseYield?.denominator ?? null,
    base_yield_unit: cleanText(draft.baseYieldUnit),
    prep_time_seconds: draft.prepTimeSeconds,
    cook_time_seconds: draft.cookTimeSeconds,
    total_time_seconds: totalTime(draft.prepTimeSeconds, draft.cookTimeSeconds),
    favorite: draft.favorite ? 1 : 0,
    want_to_make: draft.wantToMake ? 1 : 0,
    updated_at: now,
  }
}

function ingredientPayload(
  ingredient: RecipeDraftIngredient,
  recipeId: string,
  position: number,
  pairId: string,
  now: string,
  current?: JsonObject,
): JsonObject {
  const persisted = serializeIngredientAmount(ingredient.amount)
  return {
    ...(current ?? {}),
    pair_id: pairId,
    revision: current?.revision ?? 0,
    recipe_id: recipeId,
    position,
    quantity_numerator: persisted.quantityNum,
    quantity_denominator: persisted.quantityDen,
    quantity_text: persisted.quantityText,
    unit: cleanText(ingredient.unit),
    ingredient_name: ingredient.name.trim(),
    normalized_name: normalizeIngredientName(ingredient.name),
    note: cleanText(ingredient.note),
    is_approximate: ingredient.isApproximate ? 1 : 0,
    is_optional: ingredient.isOptional ? 1 : 0,
    created_at: current?.created_at ?? now,
    updated_at: now,
    deleted_at: null,
  }
}

function stepPayload(
  step: RecipeDraftStep,
  recipeId: string,
  position: number,
  pairId: string,
  now: string,
  current?: JsonObject,
): JsonObject {
  return {
    ...(current ?? {}),
    pair_id: pairId,
    revision: current?.revision ?? 0,
    recipe_id: recipeId,
    position,
    instruction: step.instruction.trim(),
    duration_seconds: step.durationSeconds,
    observation: cleanText(step.note),
    created_at: current?.created_at ?? now,
    updated_at: now,
    deleted_at: null,
  }
}

export class RecipeRepository {
  constructor(
    private readonly database: PowerSyncDatabase,
    private readonly scope: RecipeRepositoryScope,
    private readonly writeMutation: MutationWriter = performLocalMutation,
  ) {}

  async createRecipe(draft: RecipeDraft): Promise<string> {
    validateDraft(draft)
    const now = new Date().toISOString()

    await this.writeMutation(this.database, createMutationEnvelope({
      pairId: this.scope.pairId,
      actorUserId: this.scope.actorUserId,
      entityType: 'recipes',
      entityId: draft.id,
      operation: 'create',
      baseRevision: null,
      base: null,
      next: recipeCreatePayload(draft, this.scope, now),
    }))

    for (const [position, ingredient] of draft.ingredients.entries()) {
      await this.writeMutation(this.database, createMutationEnvelope({
        pairId: this.scope.pairId,
        actorUserId: this.scope.actorUserId,
        entityType: 'recipe_ingredients',
        entityId: ingredient.id,
        operation: 'create',
        baseRevision: null,
        base: null,
        next: ingredientPayload(ingredient, draft.id, position, this.scope.pairId, now),
      }))
    }

    for (const [position, step] of draft.steps.entries()) {
      await this.writeMutation(this.database, createMutationEnvelope({
        pairId: this.scope.pairId,
        actorUserId: this.scope.actorUserId,
        entityType: 'recipe_steps',
        entityId: step.id,
        operation: 'create',
        baseRevision: null,
        base: null,
        next: stepPayload(step, draft.id, position, this.scope.pairId, now),
      }))
    }

    return draft.id
  }

  async updateRecipe(recipeId: string, draft: RecipeDraft): Promise<void> {
    if (recipeId !== draft.id) throw new Error('Recipe draft id does not match the edited recipe')
    validateDraft(draft)
    const now = new Date().toISOString()

    const recipeRow = await this.database.getOptional<RecipeRow>(
      'SELECT * FROM recipes WHERE id = ? AND pair_id = ? AND deleted_at IS NULL LIMIT 1',
      [recipeId, this.scope.pairId],
    )
    if (!recipeRow) throw new Error('Recipe not found')
    const currentRecipe = asJsonObject(recipeRow)
    const recipeBase = await resolveMutationBase(this.database, 'recipes', recipeId, currentRecipe)

    await this.writeMutation(this.database, createMutationEnvelope({
      pairId: this.scope.pairId,
      actorUserId: this.scope.actorUserId,
      entityType: 'recipes',
      entityId: recipeId,
      operation: 'update',
      ...recipeBase,
      next: recipeUpdatePayload(draft, currentRecipe, now),
    }))

    await this.updateIngredients(recipeId, draft.ingredients, now)
    await this.updateSteps(recipeId, draft.steps, now)
  }

  async softDeleteRecipe(recipeId: string): Promise<void> {
    const row = await this.database.getOptional<RecipeRow>(
      'SELECT * FROM recipes WHERE id = ? AND pair_id = ? AND deleted_at IS NULL LIMIT 1',
      [recipeId, this.scope.pairId],
    )
    if (!row) throw new Error('Recipe not found')
    const current = asJsonObject(row)
    const base = await resolveMutationBase(this.database, 'recipes', recipeId, current)
    const now = new Date().toISOString()

    await this.writeMutation(this.database, createMutationEnvelope({
      pairId: this.scope.pairId,
      actorUserId: this.scope.actorUserId,
      entityType: 'recipes',
      entityId: recipeId,
      operation: 'soft_delete',
      ...base,
      next: { ...current, deleted_at: now, updated_at: now },
    }))
  }

  private async updateIngredients(
    recipeId: string,
    draftIngredients: RecipeDraftIngredient[],
    now: string,
  ): Promise<void> {
    const rows = await this.database.getAll<IngredientRow>(
      'SELECT * FROM recipe_ingredients WHERE recipe_id = ? AND pair_id = ? AND deleted_at IS NULL ORDER BY position ASC',
      [recipeId, this.scope.pairId],
    )
    const existing = new Map(rows.map((row) => [row.id, row]))

    for (const [position, ingredient] of draftIngredients.entries()) {
      const row = existing.get(ingredient.id)
      if (!row) {
        await this.writeMutation(this.database, createMutationEnvelope({
          pairId: this.scope.pairId,
          actorUserId: this.scope.actorUserId,
          entityType: 'recipe_ingredients',
          entityId: ingredient.id,
          operation: 'create',
          baseRevision: null,
          base: null,
          next: ingredientPayload(ingredient, recipeId, position, this.scope.pairId, now),
        }))
        continue
      }

      existing.delete(ingredient.id)
      const current = asJsonObject(row)
      const base = await resolveMutationBase(this.database, 'recipe_ingredients', ingredient.id, current)
      await this.writeMutation(this.database, createMutationEnvelope({
        pairId: this.scope.pairId,
        actorUserId: this.scope.actorUserId,
        entityType: 'recipe_ingredients',
        entityId: ingredient.id,
        operation: 'update',
        ...base,
        next: ingredientPayload(ingredient, recipeId, position, this.scope.pairId, now, current),
      }))
    }

    for (const [id, row] of existing) {
      const current = asJsonObject(row)
      const base = await resolveMutationBase(this.database, 'recipe_ingredients', id, current)
      await this.writeMutation(this.database, createMutationEnvelope({
        pairId: this.scope.pairId,
        actorUserId: this.scope.actorUserId,
        entityType: 'recipe_ingredients',
        entityId: id,
        operation: 'soft_delete',
        ...base,
        next: { ...current, deleted_at: now, updated_at: now },
      }))
    }
  }

  private async updateSteps(recipeId: string, draftSteps: RecipeDraftStep[], now: string): Promise<void> {
    const rows = await this.database.getAll<StepRow>(
      'SELECT * FROM recipe_steps WHERE recipe_id = ? AND pair_id = ? AND deleted_at IS NULL ORDER BY position ASC',
      [recipeId, this.scope.pairId],
    )
    const existing = new Map(rows.map((row) => [row.id, row]))

    for (const [position, step] of draftSteps.entries()) {
      const row = existing.get(step.id)
      if (!row) {
        await this.writeMutation(this.database, createMutationEnvelope({
          pairId: this.scope.pairId,
          actorUserId: this.scope.actorUserId,
          entityType: 'recipe_steps',
          entityId: step.id,
          operation: 'create',
          baseRevision: null,
          base: null,
          next: stepPayload(step, recipeId, position, this.scope.pairId, now),
        }))
        continue
      }

      existing.delete(step.id)
      const current = asJsonObject(row)
      const base = await resolveMutationBase(this.database, 'recipe_steps', step.id, current)
      await this.writeMutation(this.database, createMutationEnvelope({
        pairId: this.scope.pairId,
        actorUserId: this.scope.actorUserId,
        entityType: 'recipe_steps',
        entityId: step.id,
        operation: 'update',
        ...base,
        next: stepPayload(step, recipeId, position, this.scope.pairId, now, current),
      }))
    }

    for (const [id, row] of existing) {
      const current = asJsonObject(row)
      const base = await resolveMutationBase(this.database, 'recipe_steps', id, current)
      await this.writeMutation(this.database, createMutationEnvelope({
        pairId: this.scope.pairId,
        actorUserId: this.scope.actorUserId,
        entityType: 'recipe_steps',
        entityId: id,
        operation: 'soft_delete',
        ...base,
        next: { ...current, deleted_at: now, updated_at: now },
      }))
    }
  }
}
