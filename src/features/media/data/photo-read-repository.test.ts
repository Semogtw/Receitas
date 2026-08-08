import type { PowerSyncDatabase } from '@powersync/web'
import { describe, expect, it, vi } from 'vitest'
import { PhotoReadRepository } from './photo-read-repository'

const pairId = 'pair-a'

function database(rows: Record<string, unknown>[]) {
  return { getAll: vi.fn(async () => rows) } as unknown as PowerSyncDatabase
}

describe('PhotoReadRepository', () => {
  it('lists active recipe photos in stable presentation order', async () => {
    const db = database([
      { id: 'photo-a', storage_path: 'a.webp', position: 0, caption: 'Primeira', created_at: '2026-08-07T20:00:00.000Z' },
      { id: 'photo-b', storage_path: 'b.webp', position: 1, caption: null, created_at: '2026-08-07T20:01:00.000Z' },
    ])
    const repository = new PhotoReadRepository(db, pairId)

    await expect(repository.listRecipePhotos('recipe-a')).resolves.toEqual([
      { id: 'photo-a', storagePath: 'a.webp', position: 0, caption: 'Primeira', createdAt: '2026-08-07T20:00:00.000Z' },
      { id: 'photo-b', storagePath: 'b.webp', position: 1, caption: null, createdAt: '2026-08-07T20:01:00.000Z' },
    ])
    expect(vi.mocked(db.getAll).mock.calls[0]?.[0]).toContain('deleted_at IS NULL')
  })

  it('uses the cooking-session photo table for preparation history', async () => {
    const db = database([])
    const repository = new PhotoReadRepository(db, pairId)

    await repository.listCookingSessionPhotos('session-a')

    expect(vi.mocked(db.getAll).mock.calls[0]?.[0]).toContain('cooking_session_photos')
    expect(vi.mocked(db.getAll).mock.calls[0]?.[1]).toEqual(['session-a', pairId])
  })
})
