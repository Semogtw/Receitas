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

function fixture() {
  const cache = {
    put: vi.fn(async () => undefined),
    get: vi.fn(async () => null as Blob | null),
    delete: vi.fn(async () => true),
  }
  const queue = {
    enqueue: vi.fn(async () => undefined),
    load: vi.fn(async () => [] as MediaUploadJob[]),
    markUploading: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
    retry: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  }
  const storage = { upload: vi.fn(async () => undefined) }
  const metadata = { publish: vi.fn(async () => undefined) }
  const remote = { download: vi.fn(async () => new Blob(['remote'], { type: 'image/webp' })) }
  const prepare = vi.fn(async () => prepared)
  const runtime = new MediaRuntime({ cache, queue, storage, metadata, remote, prepare })
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
})
