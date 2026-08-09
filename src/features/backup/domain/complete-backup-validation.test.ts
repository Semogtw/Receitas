import { describe, expect, it } from 'vitest'
import { COMPLETE_BACKUP_DATA_PATHS, createBackupManifest } from './complete-backup-format'
import {
  parseCompleteBackupManifest,
  validateArchiveAgainstManifest,
  validateArchiveEntryMetadata,
  validateStructuredBackupData,
  type ArchiveEntryMetadata,
} from './complete-backup-validation'

const checksum = 'a'.repeat(64)
const pairId = '20000000-0000-4000-8000-000000000002'

function manifest() {
  return createBackupManifest({
    createdAt: '2026-08-09T10:00:00.000Z',
    appVersion: '0.0.0',
    pairExportId: 'export-1',
    dataFiles: COMPLETE_BACKUP_DATA_PATHS.map((path) => ({ path, sha256: checksum, bytes: 2 })),
    mediaFiles: [{ path: 'media/photo-1.webp', sha256: checksum, bytes: 10, mediaType: 'image/webp' }],
  })
}

function meta(filename: string, uncompressedSize = 2, compressedSize = 2): ArchiveEntryMetadata {
  return { filename, uncompressedSize, compressedSize, directory: false }
}

function archiveEntries(): ArchiveEntryMetadata[] {
  const current = manifest()
  return [
    meta('manifest.json', 200, 100),
    ...current.dataFiles.map((entry) => meta(entry.path, entry.bytes, entry.bytes)),
    ...current.mediaFiles.map((entry) => meta(entry.path, entry.bytes, entry.bytes)),
  ]
}

function validStructuredData() {
  const data = new Map<string, unknown>()
  for (const path of COMPLETE_BACKUP_DATA_PATHS) data.set(path, [])
  data.set('data/pair.json', { sourcePairId: pairId, exportedAt: '2026-08-09T10:00:00.000Z' })
  data.set('data/recipes.json', [{ id: 'recipe-1', pair_id: pairId }])
  data.set('data/recipe-ingredients.json', [{ id: 'ingredient-1', pair_id: pairId, recipe_id: 'recipe-1' }])
  data.set('data/recipe-steps.json', [{ id: 'step-1', pair_id: pairId, recipe_id: 'recipe-1' }])
  data.set('data/categories.json', [{ id: 'category-1', pair_id: pairId }])
  data.set('data/recipe-categories.json', [{ id: 'join-1', pair_id: pairId, recipe_id: 'recipe-1', category_id: 'category-1' }])
  data.set('data/cooking-sessions.json', [{ id: 'session-1', pair_id: pairId, recipe_id: 'recipe-1' }])
  data.set('data/cooking-session-ratings.json', [{ id: 'rating-1', pair_id: pairId, cooking_session_id: 'session-1' }])
  data.set('data/meal-periods.json', [{ id: 'period-1', pair_id: pairId }])
  data.set('data/meal-plan-entries.json', [{ id: 'meal-1', pair_id: pairId, recipe_id: 'recipe-1', meal_period_id: 'period-1' }])
  data.set('data/shopping-lists.json', [{ id: 'list-1', pair_id: pairId }])
  data.set('data/shopping-items.json', [{ id: 'item-1', pair_id: pairId, shopping_list_id: 'list-1' }])
  data.set('data/conversion-profiles.json', [{ id: 'conversion-1', pair_id: pairId }])
  data.set('data/photo-metadata.json', [
    { id: 'photo-1', pair_id: pairId, ownerType: 'recipe', recipe_id: 'recipe-1' },
    { id: 'photo-2', pair_id: pairId, ownerType: 'cooking_session', cooking_session_id: 'session-1' },
  ])
  return data
}

describe('complete backup archive metadata validation', () => {
  it('rejects traversal, duplicate paths, directories and symlinks', () => {
    expect(() => validateArchiveEntryMetadata([meta('../manifest.json')])).toThrow('Unsafe backup archive path')
    expect(() => validateArchiveEntryMetadata([meta('manifest.json'), meta('manifest.json')])).toThrow('Duplicate')
    expect(() => validateArchiveEntryMetadata([{ ...meta('manifest.json'), directory: true }])).toThrow('Directory entries')
    expect(() => validateArchiveEntryMetadata([
      { ...meta('manifest.json'), externalFileAttributes: 0o120777 << 16 },
    ])).toThrow('Symlink-like')
  })

  it('rejects encrypted entries and suspicious compression ratios', () => {
    expect(() => validateArchiveEntryMetadata([{ ...meta('manifest.json'), encrypted: true }])).toThrow('Encrypted')
    expect(() => validateArchiveEntryMetadata([meta('manifest.json', 1_000_000, 1)])).toThrow('compression ratio')
  })

  it('requires every archive entry to be declared by the manifest with matching bytes', () => {
    const current = manifest()
    const entries = archiveEntries()
    validateArchiveEntryMetadata(entries)
    expect(() => validateArchiveAgainstManifest([...entries, meta('data/extra.json')], current)).toThrow('undeclared')
    expect(() => validateArchiveAgainstManifest(
      entries.map((entry) => entry.filename === 'data/recipes.json' ? { ...entry, uncompressedSize: 3 } : entry),
      current,
    )).toThrow('byte count differs')
  })
})

describe('complete backup manifest parsing', () => {
  it('rejects unknown manifest fields rather than silently accepting another format', () => {
    const value = { ...manifest(), session: 'should-not-exist' }
    expect(() => parseCompleteBackupManifest(JSON.stringify(value))).toThrow('unsupported field')
  })

  it('round-trips a valid strict manifest', () => {
    expect(parseCompleteBackupManifest(JSON.stringify(manifest()))).toEqual(manifest())
  })
})

describe('complete backup domain cross-reference validation', () => {
  it('accepts a pair-scoped graph whose references all resolve', () => {
    expect(validateStructuredBackupData(validStructuredData()).sourcePairId).toBe(pairId)
  })

  it('rejects rows that escape the source pair', () => {
    const data = validStructuredData()
    data.set('data/shopping-lists.json', [{ id: 'list-1', pair_id: 'other-pair' }])
    expect(() => validateStructuredBackupData(data)).toThrow('escapes the source pair scope')
  })

  it('rejects broken recipe, planner, shopping and photo references', () => {
    const recipe = validStructuredData()
    recipe.set('data/recipe-steps.json', [{ id: 'step-1', pair_id: pairId, recipe_id: 'missing' }])
    expect(() => validateStructuredBackupData(recipe)).toThrow('unknown id missing')

    const planner = validStructuredData()
    planner.set('data/meal-plan-entries.json', [{ id: 'meal-1', pair_id: pairId, recipe_id: 'recipe-1', meal_period_id: 'missing' }])
    expect(() => validateStructuredBackupData(planner)).toThrow('Meal plan meal_period_id')

    const shopping = validStructuredData()
    shopping.set('data/shopping-items.json', [{ id: 'item-1', pair_id: pairId, shopping_list_id: 'missing' }])
    expect(() => validateStructuredBackupData(shopping)).toThrow('Shopping item shopping_list_id')

    const photos = validStructuredData()
    photos.set('data/photo-metadata.json', [{ id: 'photo-1', pair_id: pairId, ownerType: 'recipe', recipe_id: 'missing' }])
    expect(() => validateStructuredBackupData(photos)).toThrow('Recipe photo recipe_id')
  })

  it('rejects duplicate stable ids inside a canonical table', () => {
    const data = validStructuredData()
    data.set('data/categories.json', [
      { id: 'category-1', pair_id: pairId },
      { id: 'category-1', pair_id: pairId },
    ])
    expect(() => validateStructuredBackupData(data)).toThrow('duplicate id category-1')
  })
})
