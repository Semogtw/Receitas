import { describe, expect, it } from 'vitest'
import { parsePortableBackup, serializePortableBackup, type PortableBackupV1 } from './portable-backup'

const backup: PortableBackupV1 = {
  format: 'receitas-portable-backup',
  version: 1,
  scope: 'active-shared-data',
  exportedAt: '2026-08-07T22:00:00.000Z',
  sourcePairId: 'pair-a',
  categories: [{ id: 'category-a', name: 'Sobremesas' }],
  conversionProfiles: [],
  recipes: [],
}

describe('portable backup format', () => {
  it('round-trips a versioned archive without silently changing data', () => {
    const serialized = serializePortableBackup(backup)
    expect(parsePortableBackup(serialized)).toEqual(backup)
  })

  it('rejects unknown formats and future versions before import code can see them', () => {
    expect(() => parsePortableBackup(JSON.stringify({ ...backup, format: 'other' }))).toThrow('format')
    expect(() => parsePortableBackup(JSON.stringify({ ...backup, version: 2 }))).toThrow('version')
  })

  it('rejects archives without an explicit source pair or ISO export timestamp', () => {
    expect(() => parsePortableBackup(JSON.stringify({ ...backup, sourcePairId: '' }))).toThrow('pair')
    expect(() => parsePortableBackup(JSON.stringify({ ...backup, exportedAt: 'yesterday' }))).toThrow('timestamp')
  })

  it('rejects local/transient fields at the archive root', () => {
    expect(() => parsePortableBackup(JSON.stringify({ ...backup, mutationOutbox: [] }))).toThrow('unsupported root field')
    expect(() => parsePortableBackup(JSON.stringify({ ...backup, activeCookingDraft: {} }))).toThrow('unsupported root field')
  })

  it('rejects duplicate category and recipe ids so import identity stays deterministic', () => {
    expect(() => parsePortableBackup(JSON.stringify({
      ...backup,
      categories: [{ id: 'category-a', name: 'A' }, { id: 'category-a', name: 'B' }],
    }))).toThrow('duplicate category')

    const recipeEntry = {
      recipe: {
        id: 'recipe-a', revision: 1, title: 'Bolo', description: null, favorite: false, wantToMake: false,
        baseYield: null, baseYieldUnit: null, prepTimeSeconds: null, cookTimeSeconds: null, totalTimeSeconds: null,
        updatedAt: '2026-08-07T20:00:00.000Z', ingredients: [], steps: [],
      },
      categoryIds: [],
      history: [],
      photos: [],
      sessionPhotos: {},
    }
    expect(() => parsePortableBackup(JSON.stringify({ ...backup, recipes: [recipeEntry, recipeEntry] }))).toThrow('duplicate recipe')
  })
})
