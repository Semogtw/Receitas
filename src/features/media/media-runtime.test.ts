import { describe, expect, it, vi } from 'vitest'
import type { PreparedImage } from './browser/prepare-image'
import type { MediaUploadJob } from './data/media-upload-queue'
import { MediaRuntime } from './media-runtime'

const prepared: PreparedImage = {
  blob: new Blob(['prepared'], { type: 'image/webp' }),
  width: 800,
  height: 600,
  mimeType: 'image/webp',
  extension: 'webp',
}

const pendingJob: MediaUploadJob = {
  version: 1,
  id: 'photo-a',
  pairId: 'pair-a',
  ownerType: 'recipe',
  ownerId: 'recipe-a',
  mimeType: 'image/webp',
  extension: 'webp',
  width: 800,
  height: 600,
  sizeBytes: 8,
  position: 0,
  caption: null,
  createdAt: '2026-08-10T10:00:00.000Z',
  state: 'pending',
  attempts: 0,
  lastError: null,
}

function fixture(options?: { jobs?: MediaUploadJob[] }) {
  const cache = {
    put: vi.fn(async () => undefined),
    get: vi.fn(async () => null as Blob | null),
    getForUpload: vi.fn(async () => null as Blob | null),
    deleteForUpload: vi.fn(async () => true),
    delete: vi.fn(async () => true),
  }
  const queue = {
    enqueue: vi.fn(async () => undefined),
    load: vi.fn(async () => options?.jobs ?? [] as MediaUploadJob[]),
    markUploading: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
    retry: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  }
  const storage = { upload: vi.fn(async () => undefined) }
  const metadata = { publish: vi.fn(async () => undefined) }
  const remote = { download: vi.fn(async () => new Blob(['remote'], { type: 'image/webp' })) }
  const prepare = vi.fn(async () => prepared)
  const runtime = new MediaRuntime({ pairId: 'pair-a', cache, queue, storage, metadata, remote, prepare })
  return { runtime, cache, queue, storage, metadata, remote, prepare }
}

describe('MediaRuntime', () => {
  it('queues a photo through the prepared offline pipeline', async () => {
    const value = fixture()
    const file = new File(['original'], 'photo.jpg', { type: 'image/jpeg' })

    const job = await value.runtime.queuePhoto({
      file, pairId: 'pair-a', ownerType: 'recipe', ownerId: 'recipe-a', position: 0, mediaId: 'photo-a',
    })

    expect(job.id).toBe('photo-a')
    expect(value.prepare).toHaveBeenCalledWith(file)
    expect(value.cache.put).toHaveBeenCalledWith('photo-a', prepared.blob)
    expect(value.queue.enqueue).toHaveBeenCalledWith(job)
  })

  it('rejects a queue request for another pair before preparing or caching a file', async () => {
    const value = fixture()
    const file = new File(['original'], 'photo.jpg', { type: 'image/jpeg' })

    await expect(value.runtime.queuePhoto({
      file, pairId: 'pair-b', ownerType: 'recipe', ownerId: 'recipe-b', position: 0, mediaId: 'photo-b',
    })).rejects.toThrow('active pair')

    expect(value.prepare).not.toHaveBeenCalled()
    expect(value.cache.put).not.toHaveBeenCalled()
    expect(value.queue.enqueue).not.toHaveBeenCalled()
  })

  it('retries a failed item before draining uploads', async () => {
    const value = fixture()
    await value.runtime.retryUpload('photo-a')
    expect(value.queue.retry).toHaveBeenCalledWith('photo-a')
  })

  it('resolves an uploaded photo cache-first through the same runtime', async () => {
    const value = fixture()
    const blob = await value.runtime.resolveBlob('photo-a', 'pairs/pair-a/photo-a.webp')
    expect(blob.type).toBe('image/webp')
    expect(value.remote.download).toHaveBeenCalledTimes(1)
    expect(value.cache.put).toHaveBeenCalledWith('photo-a', expect.any(Blob))
  })

  it('reads pending previews through the pair-bound upload cache path', async () => {
    const value = fixture({ jobs: [pendingJob] })
    value.cache.getForUpload.mockResolvedValueOnce(new Blob(['pending'], { type: 'image/webp' }))

    const blob = await value.runtime.getPendingBlob(pendingJob)

    expect(await blob?.text()).toBe('pending')
    expect(value.cache.getForUpload).toHaveBeenCalledWith(pendingJob)
  })

  it('cancels a pending job by deleting its protected blob before removing the queue entry', async () => {
    const value = fixture({ jobs: [pendingJob] })

    await value.runtime.cancelUpload('photo-a')

    expect(value.cache.deleteForUpload).toHaveBeenCalledWith(pendingJob)
    expect(value.queue.remove).toHaveBeenCalledWith('photo-a')
    expect(value.cache.deleteForUpload.mock.invocationCallOrder[0]).toBeLessThan(value.queue.remove.mock.invocationCallOrder[0]!)
  })

  it('refuses to cancel a cross-pair job found in corrupted local queue state', async () => {
    const value = fixture({ jobs: [{ ...pendingJob, pairId: 'pair-b' }] })

    await expect(value.runtime.cancelUpload('photo-a')).rejects.toThrow('active pair')
    expect(value.cache.deleteForUpload).not.toHaveBeenCalled()
    expect(value.queue.remove).not.toHaveBeenCalled()
  })
})
