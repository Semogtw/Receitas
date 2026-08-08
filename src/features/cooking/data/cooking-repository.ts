import type { PowerSyncDatabase } from '@powersync/web'
import { createMutationEnvelope, type JsonObject, type MutationEnvelope } from '../../../data/mutations/types'
import { performLocalMutation } from '../../../data/mutations/performLocalMutation'
import { resolveMutationBase } from '../../../data/mutations/resolveMutationBase'
import { normalizeRational } from '../../recipes/domain/amount'
import type { Rational } from '../../recipes/domain/types'
import type { RecipeAggregate } from '../../recipes/data/recipe-repository'
import {
  assertValidCookingScore,
  averageRating,
  createRecipeSnapshot,
  type CookingRecipeSnapshot,
  type CookingSessionRating,
  type CookingSessionSummary,
} from '../domain/cooking-session'

export interface CookingRepositoryScope {
  pairId: string
  actorUserId: string
}

export interface CreateCookingSessionInput {
  id?: string
  recipe: RecipeAggregate
  startedAt?: string | null
  preparedAt?: string
  preparedYield?: Rational | null
  sharedObservation?: string | null
}

interface DatabaseRow extends Record<string, unknown> {
  id: string
}

type MutationWriter = (database: PowerSyncDatabase, envelope: MutationEnvelope) => Promise<string>

function cleanOptional(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function toPayload(row: DatabaseRow): JsonObject {
  const payload: JsonObject = {}
  for (const [key, value] of Object.entries(row)) {
    if (key === 'id' || value === undefined) continue
    payload[key] = value as JsonObject[string]
  }
  return payload
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be text in the local database`)
  return value
}

function requiredNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be numeric in the local database`)
  }
  return value
}

function optionalRational(numerator: unknown, denominator: unknown): Rational | null {
  const hasNumerator = numerator !== null && numerator !== undefined
  const hasDenominator = denominator !== null && denominator !== undefined
  if (!hasNumerator && !hasDenominator) return null
  if (hasNumerator !== hasDenominator) throw new Error('Cooking yield columns must be present together')
  return normalizeRational({
    numerator: requiredNumber(numerator, 'Prepared yield numerator'),
    denominator: requiredNumber(denominator, 'Prepared yield denominator'),
  })
}

function validatedPreparedYield(value: Rational | null | undefined): Rational | null {
  if (!value) return null
  const normalized = normalizeRational(value)
  if (normalized.numerator <= 0) throw new Error('Prepared yield must be greater than zero')
  return normalized
}

function parseSnapshot(value: unknown, version: unknown): CookingRecipeSnapshot {
  if (Number(version) !== 1) throw new Error('Unsupported cooking recipe snapshot version')

  let parsed: unknown = value
  if (typeof value === 'string') parsed = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Cooking recipe snapshot must be an object')
  }

  const snapshot = parsed as Partial<CookingRecipeSnapshot>
  if (
    snapshot.version !== 1 ||
    typeof snapshot.recipeId !== 'string' ||
    typeof snapshot.recipeRevision !== 'number' ||
    typeof snapshot.title !== 'string' ||
    !Array.isArray(snapshot.ingredients) ||
    !Array.isArray(snapshot.steps)
  ) {
    throw new Error('Cooking recipe snapshot is malformed')
  }

  return snapshot as CookingRecipeSnapshot
}

function mapRating(row: DatabaseRow): CookingSessionRating {
  const score = requiredNumber(row.score, 'Cooking rating score')
  assertValidCookingScore(score)
  return {
    id: row.id,
    sessionId: requiredString(row.cooking_session_id, 'Cooking rating session id'),
    userId: requiredString(row.user_id, 'Cooking rating user id'),
    score,
    comment: nullableString(row.comment),
    updatedAt: requiredString(row.updated_at, 'Cooking rating updated_at'),
  }
}

export class CookingRepository {
  constructor(
    private readonly database: PowerSyncDatabase,
    private readonly scope: CookingRepositoryScope,
    private readonly writeMutation: MutationWriter = performLocalMutation,
  ) {}

  async createCookingSession(input: CreateCookingSessionInput): Promise<string> {
    const id = input.id ?? crypto.randomUUID()
    const existing = await this.database.getOptional<DatabaseRow>(
      'SELECT id FROM cooking_sessions WHERE id = ? AND pair_id = ? LIMIT 1',
      [id, this.scope.pairId],
    )
    if (existing) return id

    const preparedAt = input.preparedAt ?? new Date().toISOString()
    const preparedYield = validatedPreparedYield(input.preparedYield)
    const snapshot = createRecipeSnapshot(input.recipe)
    const now = new Date().toISOString()

    await this.writeMutation(this.database, createMutationEnvelope({
      pairId: this.scope.pairId,
      actorUserId: this.scope.actorUserId,
      entityType: 'cooking_sessions',
      entityId: id,
      operation: 'create',
      baseRevision: null,
      base: null,
      next: {
        pair_id: this.scope.pairId,
        revision: 0,
        recipe_id: input.recipe.id,
        recorded_by: this.scope.actorUserId,
        started_at: input.startedAt ?? null,
        prepared_at: preparedAt,
        prepared_yield_numerator: preparedYield?.numerator ?? null,
        prepared_yield_denominator: preparedYield?.denominator ?? null,
        shared_observation: cleanOptional(input.sharedObservation),
        recipe_snapshot_version: 1,
        recipe_snapshot: JSON.stringify(snapshot),
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
    }))

    return id
  }

  async setMyRating(sessionId: string, score: number, comment: string | null): Promise<string> {
    assertValidCookingScore(score)
    const existing = await this.database.getOptional<DatabaseRow>(
      `SELECT *
         FROM cooking_session_ratings
        WHERE cooking_session_id = ? AND pair_id = ? AND user_id = ?
        ORDER BY updated_at DESC
        LIMIT 1`,
      [sessionId, this.scope.pairId, this.scope.actorUserId],
    )
    const now = new Date().toISOString()

    if (!existing) {
      const id = crypto.randomUUID()
      await this.writeMutation(this.database, createMutationEnvelope({
        pairId: this.scope.pairId,
        actorUserId: this.scope.actorUserId,
        entityType: 'cooking_session_ratings',
        entityId: id,
        operation: 'create',
        baseRevision: null,
        base: null,
        next: {
          pair_id: this.scope.pairId,
          revision: 0,
          cooking_session_id: sessionId,
          user_id: this.scope.actorUserId,
          score,
          comment: cleanOptional(comment),
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
      }))
      return id
    }

    const current = toPayload(existing)
    const base = await resolveMutationBase(this.database, 'cooking_session_ratings', existing.id, current)
    await this.writeMutation(this.database, createMutationEnvelope({
      pairId: this.scope.pairId,
      actorUserId: this.scope.actorUserId,
      entityType: 'cooking_session_ratings',
      entityId: existing.id,
      operation: 'update',
      ...base,
      next: {
        ...current,
        score,
        comment: cleanOptional(comment),
        deleted_at: null,
        updated_at: now,
      },
    }))
    return existing.id
  }

  async setSharedObservation(sessionId: string, text: string | null): Promise<void> {
    const row = await this.database.getOptional<DatabaseRow>(
      'SELECT * FROM cooking_sessions WHERE id = ? AND pair_id = ? AND deleted_at IS NULL LIMIT 1',
      [sessionId, this.scope.pairId],
    )
    if (!row) throw new Error('Cooking session not found')

    const current = toPayload(row)
    const base = await resolveMutationBase(this.database, 'cooking_sessions', sessionId, current)
    await this.writeMutation(this.database, createMutationEnvelope({
      pairId: this.scope.pairId,
      actorUserId: this.scope.actorUserId,
      entityType: 'cooking_sessions',
      entityId: sessionId,
      operation: 'update',
      ...base,
      next: {
        ...current,
        shared_observation: cleanOptional(text),
        updated_at: new Date().toISOString(),
      },
    }))
  }

  async listRecipeHistory(recipeId: string): Promise<CookingSessionSummary[]> {
    const rows = await this.database.getAll<DatabaseRow>(
      `SELECT *
         FROM cooking_sessions
        WHERE recipe_id = ? AND pair_id = ? AND deleted_at IS NULL
        ORDER BY prepared_at DESC`,
      [recipeId, this.scope.pairId],
    )

    return Promise.all(rows.map(async (row) => {
      const ratingRows = await this.database.getAll<DatabaseRow>(
        `SELECT *
           FROM cooking_session_ratings
          WHERE cooking_session_id = ? AND pair_id = ? AND deleted_at IS NULL
          ORDER BY updated_at ASC`,
        [row.id, this.scope.pairId],
      )
      const ratings = ratingRows.map(mapRating)
      return {
        id: row.id,
        recipeId: requiredString(row.recipe_id, 'Cooking session recipe id'),
        recordedBy: requiredString(row.recorded_by, 'Cooking session recorder'),
        startedAt: nullableString(row.started_at),
        preparedAt: requiredString(row.prepared_at, 'Cooking session prepared_at'),
        preparedYield: optionalRational(row.prepared_yield_numerator, row.prepared_yield_denominator),
        sharedObservation: nullableString(row.shared_observation),
        snapshot: parseSnapshot(row.recipe_snapshot, row.recipe_snapshot_version),
        ratings,
        averageScore: averageRating(ratings),
      }
    }))
  }
}
