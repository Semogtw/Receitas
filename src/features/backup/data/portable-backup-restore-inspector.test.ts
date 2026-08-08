import type { PowerSyncDatabase } from '@powersync/web'
import { describe, expect, it, vi } from 'vitest'
import type { PortableBackupV1 } from '../domain/portable-backup'
import { inspectPortableBackupRestore } from './portable-backup-restore-inspector'

const backup: PortableBackupV1 = {
  format: 'receitas-portable-backup',
  version: 1,
  scope: 'active-shared-data',
  exportedAt: '2026-08-07T22:00:00.000Z',
  sourcePairId: 'pair-a',
  categories: [{ id: 'category-a', name: 'Sobremesas' }],
  conversionProfiles: [],
  recipes: [{
    recipe: {
      id: 'recipe-a', revision: 1, title: 'Bolo', description: null, favorite: false, wantToMake: false,
      baseYield: null, baseYieldUnit: null, prepTimeSeconds: null, cookTimeSeconds: null, totalTimeSeconds: null,
      updatedAt: '2026-08-07T20:00:00.000Z',
      ingredients: [{
        id: 'ingredient-a', recipeId: 'recipe-a', position: 0,
        amount: { kind: 'none' as const }, unit: null, name: 'Sal', normalizedName: 'sal', note: null,
        isApproximate: false, isOptional: false,
      }],
      steps: [{ id: 'step-a', recipeId: 'recipe-a', position: 0, instruction: 'Misture.', durationSeconds: null, note: null }],
    },
    categoryIds: ['category-a'],
    history: [{
      id: 'session-a', recipeId: 'recipe-a', recordedBy: 'user-a', startedAt: null,
      preparedAt: '2026-08-07T21:00:00.000Z', preparedYield: null, sharedObservation: null,
      snapshot: {
        version: 1, recipeId: 'recipe-a', recipeRevision: 1, title: 'Bolo', description: null,
        baseYield: null, baseYieldUnit: null, prepTimeSeconds: null, cookTimeSeconds: null,
        totalTimeSeconds: null, ingredients: [], steps: [],
      },
      ratings: [{ id: 'rating-a', sessionId: 'session-a', userId: 'user-a', score: 8, comment: null, updatedAt: '2026-08-07T21:05:00.000Z' }],
      averageScore: 8,
    }],
    photos: [{ id: 'photo-a', storagePath: 'pairs/pair-a/recipes/recipe-a/photo-a.webp', position: 0, caption: null, createdAt: '2026-08-07T20:10:00.000Z' }],
    sessionPhotos: {
      'session-a': [{ id: 'photo-b', storagePath: 'pairs/pair-a/cooking-sessions/session-a/photo-b.webp', position: 0, caption: null, createdAt: '2026-08-07T21:10:00.000Z' }],
    },
  }],
}

function database(existingByTable: Record<string, string[]> = {}) {
  return {
    getAll: vi.fn(async (sql: string) => {
      const table = Object.keys(existingByTable).find((candidate) => sql.includes(`FROM ${candidate}`))
      return (table ? existingByTable[table] : []).map((id) => ({ id }))
    }),
  } as unknown as PowerSyncDatabase
}

describe('inspectPortableBackupRestore', () => {
  it('allows a same-pair archive only when none of its stable ids collide locally', async () => {
    const db = database()
    const result = await inspectPortableBackupRestore(db, JSON.stringify(backup), 'pair-a')

    expect(result.canApply).toBe(true)
    expect(result.collisions).toEqual([])
    expect(vi.mocked(db.getAll)).toHaveBeenCalled()
  })

  it('reports entity-specific collisions and blocks restore rather than overwriting local rows', async () => {
    const db = database({
      recipes: ['recipe-a'],
      cooking_ratings: ['rating-a'],
      cooking_session_photos: ['photo-b'],
    })
    const result = await inspectPortableBackupRestore(db, JSON.stringify(backup), 'pair-a')

    expect(result.canApply).toBe(false)
    expect(result.collisions).toEqual(expect.arrayContaining([
      { entityType: 'recipes', id: 'recipe-a' },
      { entityType: 'cooking_ratings', id: 'rating-a' },
      { entityType: 'cooking_session_photos', id: 'photo-b' },
    ]))
  })

  it('blocks another-pair archive without querying entity collisions', async () => {
    const db = database()
    const result = await inspectPortableBackupRestore(db, JSON.stringify(backup), 'pair-b')

    expect(result.canApply).toBe(false)
    expect(result.errors).toEqual([expect.stringMatching(/outro par/i)])
    expect(vi.mocked(db.getAll)).not.toHaveBeenCalled()
  })
})
