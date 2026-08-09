import { BlobWriter, Uint8ArrayReader, ZipWriter } from '@zip.js/zip.js'
import { describe, expect, it } from 'vitest'
import {
  COMPLETE_BACKUP_DATA_PATHS,
  createBackupManifest,
  encodeBackupJson,
  sha256Hex,
  type BackupManifest,
} from '../domain/complete-backup-format'
import { inspectCompleteBackupArchive } from './complete-backup-inspector'

const pairId = '20000000-0000-4000-8000-000000000002'
const createdAt = '2026-08-09T10:00:00.000Z'

function structuredValues() {
  return new Map<string, unknown>([
    ['data/pair.json', { sourcePairId: pairId, exportedAt: createdAt }],
    ['data/recipes.json', [{ id: 'recipe-1', pair_id: pairId }]],
    ['data/recipe-ingredients.json', [{ id: 'ingredient-1', pair_id: pairId, recipe_id: 'recipe-1' }]],
    ['data/recipe-steps.json', [{ id: 'step-1', pair_id: pairId, recipe_id: 'recipe-1' }]],
    ['data/categories.json', [{ id: 'category-1', pair_id: pairId }]],
    ['data/recipe-categories.json', [{ id: 'join-1', pair_id: pairId, recipe_id: 'recipe-1', category_id: 'category-1' }]],
    ['data/cooking-sessions.json', [{ id: 'session-1', pair_id: pairId, recipe_id: 'recipe-1' }]],
    ['data/cooking-session-ratings.json', [{ id: 'rating-1', pair_id: pairId, cooking_session_id: 'session-1' }]],
    ['data/meal-periods.json', [{ id: 'period-1', pair_id: pairId }]],
    ['data/meal-plan-entries.json', [{ id: 'meal-1', pair_id: pairId, recipe_id: 'recipe-1', meal_period_id: 'period-1' }]],
    ['data/shopping-lists.json', [{ id: 'list-1', pair_id: pairId }]],
    ['data/shopping-items.json', [{ id: 'item-1', pair_id: pairId, shopping_list_id: 'list-1' }]],
    ['data/conversion-profiles.json', [{ id: 'conversion-1', pair_id: pairId }]],
    ['data/photo-metadata.json', [{
      id: 'photo-1',
      pair_id: pairId,
      ownerType: 'recipe',
      recipe_id: 'recipe-1',
      storage_path: `${pairId}/owner/photo-1.webp`,
      storage_state: 'uploaded',
      mime_type: 'image/webp',
      sha256: null,
      deleted_at: null,
    }]],
  ])
}

async function fixture(options: {
  mediaManifestSha?: string
  extraEntry?: boolean
  brokenRecipeReference?: boolean
} = {}): Promise<Blob> {
  const values = structuredValues()
  if (options.brokenRecipeReference) {
    values.set('data/recipe-steps.json', [{ id: 'step-1', pair_id: pairId, recipe_id: 'missing' }])
  }

  const dataEntries = await Promise.all(COMPLETE_BACKUP_DATA_PATHS.map(async (path) => {
    const bytes = encodeBackupJson(values.get(path))
    return { path, bytes, sha256: await sha256Hex(bytes) }
  }))
  const mediaBytes = new TextEncoder().encode('final-media-entry')
  const mediaSha = await sha256Hex(mediaBytes)
  const manifest: BackupManifest = createBackupManifest({
    createdAt,
    appVersion: '0.0.0-test',
    pairExportId: 'export-1',
    dataFiles: dataEntries.map((entry) => ({ path: entry.path, bytes: entry.bytes.byteLength, sha256: entry.sha256 })),
    mediaFiles: [{
      path: 'media/photo-1.webp',
      bytes: mediaBytes.byteLength,
      sha256: options.mediaManifestSha ?? mediaSha,
      mediaType: 'image/webp',
    }],
  })

  const blobWriter = new BlobWriter('application/zip')
  const writer = new ZipWriter(blobWriter)
  for (const entry of dataEntries) await writer.add(entry.path, new Uint8ArrayReader(entry.bytes))
  await writer.add('media/photo-1.webp', new Uint8ArrayReader(mediaBytes), { level: 0 })
  if (options.extraEntry) await writer.add('data/extra.json', new Uint8ArrayReader(encodeBackupJson({ extra: true })))
  await writer.add('manifest.json', new Uint8ArrayReader(encodeBackupJson(manifest)))
  await writer.close()
  return blobWriter.getData()
}

describe('inspectCompleteBackupArchive', () => {
  it('accepts a complete checksummed archive only after validating the full graph', async () => {
    const result = await inspectCompleteBackupArchive(await fixture())

    expect(result.sourcePairId).toBe(pairId)
    expect(result.manifest.format).toBe('receitas-backup')
    expect(result.mediaFiles).toHaveLength(1)
    expect((result.data.get('data/recipes.json') as Array<{ id: string }>)[0]?.id).toBe('recipe-1')
  })

  it('rejects corruption in the final media entry even when all structured data is valid', async () => {
    await expect(inspectCompleteBackupArchive(await fixture({ mediaManifestSha: '0'.repeat(64) })))
      .rejects.toThrow('checksum mismatch for media/photo-1.webp')
  })

  it('rejects undeclared entries before restore staging', async () => {
    await expect(inspectCompleteBackupArchive(await fixture({ extraEntry: true })))
      .rejects.toThrow('undeclared entry')
  })

  it('rejects broken domain references even when entry checksums are internally consistent', async () => {
    await expect(inspectCompleteBackupArchive(await fixture({ brokenRecipeReference: true })))
      .rejects.toThrow('unknown id missing')
  })
})
