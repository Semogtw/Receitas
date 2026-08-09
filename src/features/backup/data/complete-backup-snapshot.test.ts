import type { PowerSyncDatabase } from '@powersync/web'
import { describe, expect, it, vi } from 'vitest'
import { BackupRequiresSyncError, captureCompleteBackupSnapshot } from './complete-backup-snapshot'

const pairId = '20000000-0000-4000-8000-000000000002'
const createdAt = '2026-08-09T10:00:00.000Z'

function fakeDatabase(options: {
  pendingMutations?: number
  mediaQueue?: unknown[]
  pendingPhoto?: boolean
} = {}) {
  const pendingMutations = options.pendingMutations ?? 0
  const mediaQueue = options.mediaQueue ?? []
  const getOptional = vi.fn(async (sql: string) => {
    if (sql.includes('COUNT(*)') && sql.includes('mutation_outbox')) return { count: pendingMutations }
    if (sql.includes('device_preferences')) {
      return mediaQueue.length > 0 ? { value_json: JSON.stringify(mediaQueue) } : null
    }
    return null
  })
  const getAll = vi.fn(async (sql: string) => {
    if (sql.includes('FROM recipes ')) {
      return [{ id: 'recipe-b', pair_id: pairId, title: 'B' }, { id: 'recipe-a', pair_id: pairId, title: 'A' }]
    }
    if (sql.includes('FROM recipe_photos')) {
      return [{
        id: 'photo-1',
        pair_id: pairId,
        recipe_id: 'recipe-a',
        storage_path: `${pairId}/owner/photo-1.webp`,
        storage_state: options.pendingPhoto ? 'pending' : 'uploaded',
        mime_type: 'image/webp',
        byte_size: 12,
        sha256: 'a'.repeat(64),
        deleted_at: null,
      }]
    }
    if (sql.includes('FROM cooking_session_photos')) return []
    return []
  })

  const tx = { getOptional, getAll }
  return {
    getOptional,
    getAll,
    execute: vi.fn(async () => undefined),
    readTransaction: vi.fn(async (callback: (context: typeof tx) => Promise<unknown>) => callback(tx)),
  } as unknown as PowerSyncDatabase
}

function mediaJob() {
  return {
    version: 1,
    id: 'photo-pending',
    pairId,
    ownerType: 'recipe',
    ownerId: 'recipe-a',
    mimeType: 'image/webp',
    extension: 'webp',
    width: 800,
    height: 600,
    sizeBytes: 123,
    position: 0,
    caption: null,
    createdAt,
    state: 'pending',
    attempts: 0,
    lastError: null,
  }
}

describe('captureCompleteBackupSnapshot', () => {
  it('refuses to label an archive complete while semantic mutations are pending', async () => {
    await expect(captureCompleteBackupSnapshot(fakeDatabase({ pendingMutations: 2 }), pairId, createdAt))
      .rejects.toBeInstanceOf(BackupRequiresSyncError)
  })

  it('also waits for local media upload jobs', async () => {
    await expect(captureCompleteBackupSnapshot(fakeDatabase({ mediaQueue: [mediaJob()] }), pairId, createdAt))
      .rejects.toThrow('1 mídia(s) pendente(s)')
  })

  it('rejects canonical photo metadata that is not uploaded yet', async () => {
    await expect(captureCompleteBackupSnapshot(fakeDatabase({ pendingPhoto: true }), pairId, createdAt))
      .rejects.toThrow('ainda não está confirmada')
  })

  it('captures every canonical data file in one read transaction and includes photo metadata', async () => {
    const database = fakeDatabase()
    const snapshot = await captureCompleteBackupSnapshot(database, pairId, createdAt)

    expect(snapshot.dataEntries).toHaveLength(14)
    expect(snapshot.dataEntries.map((entry) => entry.path)).toEqual(expect.arrayContaining([
      'data/pair.json',
      'data/recipes.json',
      'data/meal-periods.json',
      'data/meal-plan-entries.json',
      'data/shopping-lists.json',
      'data/shopping-items.json',
      'data/photo-metadata.json',
    ]))
    expect(snapshot.photos).toHaveLength(1)
    expect(snapshot.photos[0]).toMatchObject({ id: 'photo-1', ownerType: 'recipe', storage_state: 'uploaded' })
    expect(vi.mocked(database.readTransaction)).toHaveBeenCalledTimes(1)

    const recipes = snapshot.dataEntries.find((entry) => entry.path === 'data/recipes.json')
    expect(recipes).toBeTruthy()
    expect(JSON.parse(new TextDecoder().decode(recipes!.bytes)).map((row: { id: string }) => row.id)).toEqual([
      'recipe-a',
      'recipe-b',
    ])
  })
})
