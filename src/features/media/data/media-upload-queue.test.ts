import type { PowerSyncDatabase } from '@powersync/web'
import { describe, expect, it, vi } from 'vitest'
import { MediaUploadQueueStore, type MediaUploadJob } from './media-upload-queue'

const baseJob: MediaUploadJob = {
  version: 1,
  id: 'photo-a',
  pairId: 'pair-a',
  ownerType: 'recipe',
  ownerId: 'recipe-a',
  mimeType: 'image/webp',
  extension: 'webp',
  width: 1600,
  height: 1200,
  sizeBytes: 12345,
  sha256: 'a'.repeat(64),
  position: 0,
  caption: null,
  createdAt: '2026-08-07T20:00:00.000Z',
  state: 'pending',
  attempts: 0,
  lastError: null,
}

function databaseWith(value: unknown = null) {
  const execute = vi.fn(async () => undefined)
  const getOptional = vi.fn(async () => value === null ? null : { value_json: JSON.stringify(value) })
  return { database: { execute, getOptional } as unknown as PowerSyncDatabase, execute, getOptional }
}

describe('MediaUploadQueueStore', () => {
  it('enqueues a local job without embedding binary media', async () => {
    const { database, execute } = databaseWith([])
    const store = new MediaUploadQueueStore(database)

    await store.enqueue(baseJob)

    const persisted = JSON.parse(String(execute.mock.calls.at(-1)?.[1]?.[0])) as MediaUploadJob[]
    expect(persisted).toHaveLength(1)
    expect(persisted[0]).toEqual(baseJob)
    expect(persisted[0]?.sha256).toBe('a'.repeat(64))
    expect(JSON.stringify(persisted[0])).not.toContain('blob')
  })

  it('rejects persisted jobs without a valid content checksum', async () => {
    const { sha256: _sha256, ...withoutChecksum } = baseJob
    const store = new MediaUploadQueueStore(databaseWith([withoutChecksum]).database)
    await expect(store.load()).rejects.toThrow('malformed')
  })

  it('is idempotent when the same media id is enqueued twice', async () => {
    const { database, execute } = databaseWith([baseJob])
    const store = new MediaUploadQueueStore(database)

    await store.enqueue({ ...baseJob, caption: 'new duplicate payload' })

    const persisted = JSON.parse(String(execute.mock.calls.at(-1)?.[1]?.[0])) as MediaUploadJob[]
    expect(persisted).toEqual([baseJob])
  })

  it('recovers an interrupted uploading item to pending after reload', async () => {
    const interrupted = { ...baseJob, state: 'uploading' as const }
    const { database, execute } = databaseWith([interrupted])
    const store = new MediaUploadQueueStore(database)

    const jobs = await store.load()

    expect(jobs[0]?.state).toBe('pending')
    const persisted = JSON.parse(String(execute.mock.calls.at(-1)?.[1]?.[0])) as MediaUploadJob[]
    expect(persisted[0]?.state).toBe('pending')
  })

  it('records failures with an attempt count and supports explicit retry', async () => {
    const { database, execute, getOptional } = databaseWith([baseJob])
    const store = new MediaUploadQueueStore(database)

    await store.markFailed(baseJob.id, 'network unavailable')
    let persisted = JSON.parse(String(execute.mock.calls.at(-1)?.[1]?.[0])) as MediaUploadJob[]
    expect(persisted[0]).toMatchObject({ state: 'failed', attempts: 1, lastError: 'network unavailable' })

    getOptional.mockResolvedValueOnce({ value_json: JSON.stringify(persisted) })
    await store.retry(baseJob.id)
    persisted = JSON.parse(String(execute.mock.calls.at(-1)?.[1]?.[0])) as MediaUploadJob[]
    expect(persisted[0]).toMatchObject({ state: 'pending', attempts: 1, lastError: null })
  })

  it('removes only the completed job from the persisted queue', async () => {
    const other = { ...baseJob, id: 'photo-b' }
    const { database, execute } = databaseWith([baseJob, other])
    const store = new MediaUploadQueueStore(database)

    await store.remove(baseJob.id)

    const persisted = JSON.parse(String(execute.mock.calls.at(-1)?.[1]?.[0])) as MediaUploadJob[]
    expect(persisted.map((job) => job.id)).toEqual(['photo-b'])
  })
})
