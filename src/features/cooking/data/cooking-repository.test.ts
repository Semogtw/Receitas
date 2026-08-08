import type { PowerSyncDatabase } from '@powersync/web'
import { describe, expect, it, vi } from 'vitest'
import type { MutationEnvelope } from '../../../data/mutations/types'
import type { RecipeAggregate } from '../../recipes/data/recipe-repository'
import { CookingRepository } from './cooking-repository'

const scope = {
  pairId: '20000000-0000-4000-8000-000000000002',
  actorUserId: '10000000-0000-4000-8000-000000000001',
}
const recipeId = '40000000-0000-4000-8000-000000000004'
const sessionId = 'a0000000-0000-4000-8000-00000000000a'
const ratingId = 'b0000000-0000-4000-8000-00000000000b'

const recipe: RecipeAggregate = {
  id: recipeId,
  revision: 3,
  title: 'Bolo simples',
  description: null,
  favorite: false,
  wantToMake: true,
  baseYield: { numerator: 4, denominator: 1 },
  baseYieldUnit: 'porções',
  prepTimeSeconds: 600,
  cookTimeSeconds: 1200,
  totalTimeSeconds: 1800,
  updatedAt: '2026-08-07T20:00:00.000Z',
  ingredients: [],
  steps: [],
}

function fakeDatabase(options?: {
  session?: Record<string, unknown> | null
  rating?: Record<string, unknown> | null
  sessions?: Record<string, unknown>[]
  ratings?: Record<string, unknown>[]
}) {
  return {
    getOptional: vi.fn(async (sql: string) => {
      if (sql.includes('mutation_outbox')) return null
      if (sql.includes('cooking_session_ratings')) return options?.rating ?? null
      if (sql.includes('cooking_sessions')) return options?.session ?? null
      return null
    }),
    getAll: vi.fn(async (sql: string) => {
      if (sql.includes('cooking_session_ratings')) return options?.ratings ?? []
      if (sql.includes('cooking_sessions')) return options?.sessions ?? []
      return []
    }),
  } as unknown as PowerSyncDatabase
}

function captureWriter(envelopes: MutationEnvelope[]) {
  return vi.fn(async (_db: PowerSyncDatabase, envelope: MutationEnvelope) => {
    envelopes.push(envelope)
    return envelope.mutationId
  })
}

describe('CookingRepository', () => {
  it('creates a cooking session with a detached recipe snapshot and exact prepared yield', async () => {
    const envelopes: MutationEnvelope[] = []
    const repository = new CookingRepository(fakeDatabase(), scope, captureWriter(envelopes))

    const id = await repository.createCookingSession({
      id: sessionId,
      recipe,
      startedAt: '2026-08-07T19:30:00.000Z',
      preparedAt: '2026-08-07T20:00:00.000Z',
      preparedYield: { numerator: 6, denominator: 1 },
      sharedObservation: 'Assou mais rápido hoje.',
    })

    expect(id).toBe(sessionId)
    expect(envelopes).toHaveLength(1)
    expect(envelopes[0]).toMatchObject({
      entityType: 'cooking_sessions',
      entityId: sessionId,
      operation: 'create',
      baseRevision: null,
      next: expect.objectContaining({
        pair_id: scope.pairId,
        recipe_id: recipeId,
        recorded_by: scope.actorUserId,
        prepared_yield_numerator: 6,
        prepared_yield_denominator: 1,
        shared_observation: 'Assou mais rápido hoje.',
        recipe_snapshot_version: 1,
      }),
    })
    const snapshot = JSON.parse(String(envelopes[0]?.next.recipe_snapshot))
    expect(snapshot).toMatchObject({ recipeId, recipeRevision: 3, title: 'Bolo simples' })
  })

  it('returns the same id without creating a second session when finalization is retried', async () => {
    const existing = {
      id: sessionId,
      pair_id: scope.pairId,
      revision: 0,
      recipe_id: recipeId,
      recorded_by: scope.actorUserId,
      prepared_at: '2026-08-07T20:00:00.000Z',
      deleted_at: null,
    }
    const writer = vi.fn()
    const repository = new CookingRepository(fakeDatabase({ session: existing }), scope, writer)

    await expect(repository.createCookingSession({ id: sessionId, recipe })).resolves.toBe(sessionId)
    expect(writer).not.toHaveBeenCalled()
  })

  it('creates at most one active rating per current user and updates the same row on re-rating', async () => {
    const existing = {
      id: ratingId,
      pair_id: scope.pairId,
      revision: 2,
      cooking_session_id: sessionId,
      user_id: scope.actorUserId,
      score: 7.5,
      comment: 'Bom.',
      created_at: '2026-08-07T20:00:00.000Z',
      updated_at: '2026-08-07T20:05:00.000Z',
      deleted_at: null,
    }
    const envelopes: MutationEnvelope[] = []
    const repository = new CookingRepository(fakeDatabase({ rating: existing }), scope, captureWriter(envelopes))

    const id = await repository.setMyRating(sessionId, 9, 'Faria de novo.')

    expect(id).toBe(ratingId)
    expect(envelopes).toHaveLength(1)
    expect(envelopes[0]).toMatchObject({
      entityType: 'cooking_session_ratings',
      entityId: ratingId,
      operation: 'update',
      baseRevision: 2,
      next: expect.objectContaining({ score: 9, comment: 'Faria de novo.', deleted_at: null }),
    })
  })

  it('restores the latest deleted rating instead of creating a duplicate identity', async () => {
    const deleted = {
      id: ratingId,
      pair_id: scope.pairId,
      revision: 4,
      cooking_session_id: sessionId,
      user_id: scope.actorUserId,
      score: 6,
      comment: null,
      created_at: '2026-08-07T20:00:00.000Z',
      updated_at: '2026-08-07T20:05:00.000Z',
      deleted_at: '2026-08-07T20:06:00.000Z',
    }
    const envelopes: MutationEnvelope[] = []
    const repository = new CookingRepository(fakeDatabase({ rating: deleted }), scope, captureWriter(envelopes))

    await repository.setMyRating(sessionId, 8.5, null)

    expect(envelopes[0]).toMatchObject({
      entityId: ratingId,
      operation: 'update',
      next: expect.objectContaining({ score: 8.5, deleted_at: null }),
    })
  })

  it('updates the shared observation on the session without touching personal rating comments', async () => {
    const session = {
      id: sessionId,
      pair_id: scope.pairId,
      revision: 5,
      recipe_id: recipeId,
      shared_observation: null,
      updated_at: '2026-08-07T20:00:00.000Z',
      deleted_at: null,
    }
    const envelopes: MutationEnvelope[] = []
    const repository = new CookingRepository(fakeDatabase({ session }), scope, captureWriter(envelopes))

    await repository.setSharedObservation(sessionId, 'Usar forma maior.')

    expect(envelopes[0]).toMatchObject({
      entityType: 'cooking_sessions',
      operation: 'update',
      next: expect.objectContaining({ shared_observation: 'Usar forma maior.' }),
    })
    expect(envelopes[0]?.next).not.toHaveProperty('comment')
  })

  it('lists history with independent ratings and an average that excludes missing members', async () => {
    const snapshot = {
      version: 1,
      recipeId,
      recipeRevision: 3,
      title: 'Bolo simples',
      description: null,
      baseYield: { numerator: 4, denominator: 1 },
      baseYieldUnit: 'porções',
      prepTimeSeconds: 600,
      cookTimeSeconds: 1200,
      totalTimeSeconds: 1800,
      ingredients: [],
      steps: [],
    }
    const session = {
      id: sessionId,
      pair_id: scope.pairId,
      revision: 1,
      recipe_id: recipeId,
      recorded_by: scope.actorUserId,
      started_at: null,
      prepared_at: '2026-08-07T20:00:00.000Z',
      prepared_yield_numerator: 4,
      prepared_yield_denominator: 1,
      shared_observation: 'Ficou ótimo.',
      recipe_snapshot_version: 1,
      recipe_snapshot: JSON.stringify(snapshot),
      updated_at: '2026-08-07T20:00:00.000Z',
      deleted_at: null,
    }
    const rating = {
      id: ratingId,
      cooking_session_id: sessionId,
      user_id: scope.actorUserId,
      score: 8.5,
      comment: 'Gostei.',
      updated_at: '2026-08-07T20:05:00.000Z',
      deleted_at: null,
    }
    const repository = new CookingRepository(fakeDatabase({ sessions: [session], ratings: [rating] }), scope)

    const history = await repository.listRecipeHistory(recipeId)

    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({
      id: sessionId,
      sharedObservation: 'Ficou ótimo.',
      averageScore: 8.5,
      ratings: [expect.objectContaining({ userId: scope.actorUserId, score: 8.5, comment: 'Gostei.' })],
      snapshot: expect.objectContaining({ title: 'Bolo simples' }),
    })
  })
})
