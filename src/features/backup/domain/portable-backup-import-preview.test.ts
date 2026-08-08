import { describe, expect, it } from 'vitest'
import type { PortableBackupV1 } from './portable-backup'
import { previewPortableBackupImport } from './portable-backup-import-preview'

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
      id: 'recipe-a', revision: 2, title: 'Bolo', description: null, favorite: false, wantToMake: false,
      baseYield: null, baseYieldUnit: null, prepTimeSeconds: null, cookTimeSeconds: null, totalTimeSeconds: null,
      updatedAt: '2026-08-07T20:00:00.000Z', ingredients: [], steps: [],
    },
    categoryIds: ['category-a'],
    history: [{
      id: 'session-a', recipeId: 'recipe-a', recordedBy: 'user-a', startedAt: null,
      preparedAt: '2026-08-07T21:00:00.000Z', preparedYield: null, sharedObservation: null,
      snapshot: {
        version: 1, recipeId: 'recipe-a', recipeRevision: 2, title: 'Bolo', description: null,
        baseYield: null, baseYieldUnit: null, prepTimeSeconds: null, cookTimeSeconds: null,
        totalTimeSeconds: null, ingredients: [], steps: [],
      },
      ratings: [{ id: 'rating-a', sessionId: 'session-a', userId: 'user-a', score: 9, comment: null, updatedAt: '2026-08-07T21:05:00.000Z' }],
      averageScore: 9,
    }],
    photos: [{ id: 'photo-a', storagePath: 'pairs/pair-a/recipes/recipe-a/photo-a.webp', position: 0, caption: null, createdAt: '2026-08-07T20:10:00.000Z' }],
    sessionPhotos: {
      'session-a': [{ id: 'photo-b', storagePath: 'pairs/pair-a/cooking-sessions/session-a/photo-b.webp', position: 0, caption: null, createdAt: '2026-08-07T21:10:00.000Z' }],
    },
  }],
}

describe('previewPortableBackupImport', () => {
  it('reports deterministic counts before any restore writes are possible', () => {
    const preview = previewPortableBackupImport(JSON.stringify(backup), 'pair-a')

    expect(preview).toMatchObject({
      sourcePairId: 'pair-a',
      targetPairId: 'pair-a',
      canImport: true,
      counts: {
        categories: 1,
        conversionProfiles: 0,
        recipes: 1,
        cookingSessions: 1,
        ratings: 1,
        recipePhotos: 1,
        cookingSessionPhotos: 1,
      },
    })
    expect(preview.warnings.join(' ')).toMatch(/binários/i)
    expect(preview.warnings.join(' ')).toMatch(/Storage/i)
  })

  it('blocks an archive from another pair before an importer can receive it', () => {
    const preview = previewPortableBackupImport(JSON.stringify(backup), 'pair-b')

    expect(preview.canImport).toBe(false)
    expect(preview.errors).toEqual([expect.stringMatching(/outro par/i)])
  })

  it('fails fast on malformed or unsupported archives rather than returning a permissive preview', () => {
    expect(() => previewPortableBackupImport('{bad json', 'pair-a')).toThrow('valid JSON')
    expect(() => previewPortableBackupImport(JSON.stringify({ ...backup, version: 2 }), 'pair-a')).toThrow('version')
  })
})
