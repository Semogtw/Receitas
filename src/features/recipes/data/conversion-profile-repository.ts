import type { PowerSyncDatabase } from '@powersync/web'
import { createMutationEnvelope, type JsonObject, type MutationEnvelope } from '../../../data/mutations/types'
import { performLocalMutation } from '../../../data/mutations/performLocalMutation'
import { resolveMutationBase } from '../../../data/mutations/resolveMutationBase'
import { parseAmount } from '../domain/amount'
import type { ConversionProfile } from '../domain/types'
import type { RecipeRepositoryScope } from './recipe-repository'

interface ConversionProfileRow extends Record<string, unknown> {
  id: string
}

type MutationWriter = (database: PowerSyncDatabase, envelope: MutationEnvelope) => Promise<string>

export interface SetDensityProfileInput {
  id?: string
  ingredientKey: string
  gramsPerMilliliter: number
  sourceNote?: string | null
}

function normalizeIngredientKey(value: string): string {
  const normalized = value
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
  if (!normalized) throw new Error('Ingredient key is required')
  return normalized
}

function cleanOptional(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function rowPayload(row: ConversionProfileRow): JsonObject {
  const payload: JsonObject = {}
  for (const [key, value] of Object.entries(row)) {
    if (key === 'id' || value === undefined) continue
    payload[key] = value as JsonObject[string]
  }
  return payload
}

function exactDensity(value: number): { numerator: number; denominator: number } {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Density must be a finite number greater than zero')
  }
  const parsed = parseAmount(String(value))
  if (parsed.kind !== 'numeric' || parsed.value.numerator <= 0) {
    throw new Error('Density must have an exact numeric representation')
  }
  return parsed.value
}

function mapDensityProfile(row: ConversionProfileRow): ConversionProfile {
  const numerator = Number(row.factor_numerator)
  const denominator = Number(row.factor_denominator)
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || numerator <= 0 || denominator <= 0) {
    throw new Error('Stored density profile contains an invalid exact factor')
  }
  if (row.from_unit !== 'ml' || row.to_unit !== 'g') {
    throw new Error('Density profile must use canonical ml → g units')
  }

  return {
    ingredientKey: normalizeIngredientKey(String(row.ingredient_normalized_name ?? '')),
    gramsPerMilliliter: numerator / denominator,
    source: 'pair_override',
  }
}

export class ConversionProfileRepository {
  constructor(
    private readonly database: PowerSyncDatabase,
    private readonly scope: RecipeRepositoryScope,
    private readonly writeMutation: MutationWriter = performLocalMutation,
  ) {}

  async listDensityProfiles(): Promise<ConversionProfile[]> {
    const rows = await this.database.getAll<ConversionProfileRow>(
      `SELECT *
         FROM ingredient_conversion_profiles
        WHERE pair_id = ?
          AND from_unit = 'ml'
          AND to_unit = 'g'
          AND deleted_at IS NULL
        ORDER BY ingredient_normalized_name COLLATE NOCASE ASC`,
      [this.scope.pairId],
    )
    return rows.map(mapDensityProfile)
  }

  async setDensityProfile(input: SetDensityProfileInput): Promise<string> {
    const ingredientKey = normalizeIngredientKey(input.ingredientKey)
    const factor = exactDensity(input.gramsPerMilliliter)
    const existing = await this.database.getOptional<ConversionProfileRow>(
      `SELECT *
         FROM ingredient_conversion_profiles
        WHERE pair_id = ?
          AND ingredient_normalized_name = ?
          AND from_unit = 'ml'
          AND to_unit = 'g'
          AND deleted_at IS NULL
        LIMIT 1`,
      [this.scope.pairId, ingredientKey],
    )
    const now = new Date().toISOString()

    if (!existing) {
      const id = input.id ?? crypto.randomUUID()
      await this.writeMutation(this.database, createMutationEnvelope({
        pairId: this.scope.pairId,
        actorUserId: this.scope.actorUserId,
        entityType: 'ingredient_conversion_profiles',
        entityId: id,
        operation: 'create',
        baseRevision: null,
        base: null,
        next: {
          pair_id: this.scope.pairId,
          revision: 0,
          ingredient_normalized_name: ingredientKey,
          from_unit: 'ml',
          to_unit: 'g',
          factor_numerator: factor.numerator,
          factor_denominator: factor.denominator,
          is_approximate: 1,
          source_note: cleanOptional(input.sourceNote),
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
      }))
      return id
    }

    const current = rowPayload(existing)
    const base = await resolveMutationBase(this.database, 'ingredient_conversion_profiles', existing.id, current)
    await this.writeMutation(this.database, createMutationEnvelope({
      pairId: this.scope.pairId,
      actorUserId: this.scope.actorUserId,
      entityType: 'ingredient_conversion_profiles',
      entityId: existing.id,
      operation: 'update',
      ...base,
      next: {
        ...current,
        ingredient_normalized_name: ingredientKey,
        from_unit: 'ml',
        to_unit: 'g',
        factor_numerator: factor.numerator,
        factor_denominator: factor.denominator,
        is_approximate: 1,
        source_note: cleanOptional(input.sourceNote),
        updated_at: now,
        deleted_at: null,
      },
    }))
    return existing.id
  }

  async softDeleteDensityProfile(id: string): Promise<void> {
    const row = await this.database.getOptional<ConversionProfileRow>(
      'SELECT * FROM ingredient_conversion_profiles WHERE id = ? AND pair_id = ? AND deleted_at IS NULL LIMIT 1',
      [id, this.scope.pairId],
    )
    if (!row) return

    const current = rowPayload(row)
    const base = await resolveMutationBase(this.database, 'ingredient_conversion_profiles', id, current)
    const now = new Date().toISOString()
    await this.writeMutation(this.database, createMutationEnvelope({
      pairId: this.scope.pairId,
      actorUserId: this.scope.actorUserId,
      entityType: 'ingredient_conversion_profiles',
      entityId: id,
      operation: 'soft_delete',
      ...base,
      next: { ...current, deleted_at: now, updated_at: now },
    }))
  }
}
