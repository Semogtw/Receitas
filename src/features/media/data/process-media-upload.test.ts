import { describe, expect, it, vi } from 'vitest'
import type { MediaUploadJob } from './media-upload-queue'
import { processNextMediaUpload } from './process-media-upload'

const job: MediaUploadJob = {
  version: 1,
  id: 'photo-a',
  pairId: 'pair-a',
  ownerType: 'recipe',
  ownerId: 'recipe-a',
  mimeType: 'image/webp',
  extension: 'webp',
  width: 1600,
  height: 1200,
  sizeBytes: 5,
  position: 0,
  caption: null,
  createdAt: '2026-08-07T20:00:00.000Z',
  state: 'pending',
  attempts: 0,
  lastError: null,
}

function fixture(overrides: Partial<{
  jobs: MediaUploadJob[]
  blob: Blob | null
}> = {}) {
  const queue = {
    load: vi.fn(async () => overrides.jobs ?? [job]),
    markUploading: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  }
  const blobs = {
    getForUpload: vi.fn(async (_job: MediaUploadJob) => overrides.blob === undefined ? new Blob(['image'], { type: 'image/webp' }) : overrides.blob),
  }
  const storage = { upload: vi.fn(async () => undefined) }
  const metadata = { publish: vi.fn(async () => undefined) }
  return { queue, blobs, storage, metadata }
}

describe('processNextMediaUpload', () => {
  it('uploads a cached blob to a deterministic path before publishing synced metadata', async () => {
    const { queue, blobs, storage, metadata } = fixture()
    const result = await processNextMediaUpload({ queue, blobs, storage, metadata })

    expect(result).toEqual({ status: 'uploaded', mediaId: 'photo-a' })
    expect(queue.markUploading).toHaveBeenCalledWith('photo-a')
    expect(blobs.getForUpload).toHaveBeenCalledWith(job)
    expect(storage.upload).toHaveBeenCalledWith(
      'pairs/pair-a/recipes/recipe-a/photo-a.webp',
      expect.any(Blob),
      'image/webp',
    )
    expect(metadata.publish).toHaveBeenCalledWith(
      job,
      'pairs/pair-a/recipes/recipe-a/photo-a.webp',
    )
    expect(storage.upload.mock.invocationCallOrder[0]).toBeLessThan(metadata.publish.mock.invocationCallOrder[0]!)
    expect(queue.remove).toHaveBeenCalledWith('photo-a')
  })

  it('does nothing when no pending item exists', async () => {
    const failed = { ...job, state: 'failed' as const }
    const fixtureValue = fixture({ jobs: [failed] })

    await expect(processNextMediaUpload(fixtureValue)).resolves.toEqual({ status: 'idle' })
    expect(fixtureValue.storage.upload).not.toHaveBeenCalled()
    expect(fixtureValue.blobs.getForUpload).not.toHaveBeenCalled()
  })

  it('marks a missing cached blob as failed and never publishes metadata', async () => {
    const value = fixture({ blob: null })

    await expect(processNextMediaUpload(value)).resolves.toEqual({ status: 'failed', mediaId: 'photo-a' })
    expect(value.queue.markFailed).toHaveBeenCalledWith('photo-a', expect.stringContaining('cached'))
    expect(value.storage.upload).not.toHaveBeenCalled()
    expect(value.metadata.publish).not.toHaveBeenCalled()
  })

  it('keeps the job recoverable when storage or metadata publication fails', async () => {
    const value = fixture()
    value.metadata.publish.mockRejectedValueOnce(new Error('database offline'))

    await expect(processNextMediaUpload(value)).resolves.toEqual({ status: 'failed', mediaId: 'photo-a' })
    expect(value.storage.upload).toHaveBeenCalledTimes(1)
    expect(value.queue.remove).not.toHaveBeenCalled()
    expect(value.queue.markFailed).toHaveBeenCalledWith('photo-a', 'database offline')
  })

  it('treats a pair-scope blob rejection as a recoverable upload failure', async () => {
    const value = fixture()
    value.blobs.getForUpload.mockRejectedValueOnce(new Error('Media upload job does not belong to the active cache scope'))

    await expect(processNextMediaUpload(value)).resolves.toEqual({ status: 'failed', mediaId: 'photo-a' })
    expect(value.storage.upload).not.toHaveBeenCalled()
    expect(value.queue.markFailed).toHaveBeenCalledWith('photo-a', expect.stringContaining('active cache scope'))
  })
})
