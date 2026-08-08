import { describe, expect, it, vi } from 'vitest'
import { enqueuePreparedPhoto } from './enqueue-prepared-photo'

const file = new File(['original'], 'photo.jpg', { type: 'image/jpeg' })

describe('enqueuePreparedPhoto', () => {
  it('prepares, caches and enqueues a photo for immediate offline use', async () => {
    const prepared = {
      blob: new Blob(['prepared'], { type: 'image/webp' }),
      width: 1600,
      height: 1200,
      mimeType: 'image/webp' as const,
      extension: 'webp' as const,
    }
    const prepare = vi.fn(async () => prepared)
    const cache = { put: vi.fn(async () => undefined), delete: vi.fn(async () => true) }
    const queue = { enqueue: vi.fn(async () => undefined) }

    const job = await enqueuePreparedPhoto({
      file,
      pairId: 'pair-a',
      ownerType: 'recipe',
      ownerId: 'recipe-a',
      position: 2,
      caption: 'Saindo do forno',
      mediaId: 'photo-a',
      now: '2026-08-07T20:00:00.000Z',
      prepare,
      cache,
      queue,
    })

    expect(job).toMatchObject({
      id: 'photo-a',
      pairId: 'pair-a',
      ownerType: 'recipe',
      ownerId: 'recipe-a',
      position: 2,
      caption: 'Saindo do forno',
      mimeType: 'image/webp',
      extension: 'webp',
      width: 1600,
      height: 1200,
      sizeBytes: prepared.blob.size,
      state: 'pending',
      attempts: 0,
    })
    expect(cache.put).toHaveBeenCalledWith('photo-a', prepared.blob)
    expect(queue.enqueue).toHaveBeenCalledWith(job)
  })

  it('removes the cached blob if persisting the queue fails', async () => {
    const prepared = {
      blob: new Blob(['prepared'], { type: 'image/webp' }),
      width: 800,
      height: 600,
      mimeType: 'image/webp' as const,
      extension: 'webp' as const,
    }
    const cache = { put: vi.fn(async () => undefined), delete: vi.fn(async () => true) }
    const queue = { enqueue: vi.fn(async () => { throw new Error('local database full') }) }

    await expect(enqueuePreparedPhoto({
      file,
      pairId: 'pair-a', ownerType: 'recipe', ownerId: 'recipe-a', position: 0,
      mediaId: 'photo-a', prepare: vi.fn(async () => prepared), cache, queue,
    })).rejects.toThrow('local database full')

    expect(cache.delete).toHaveBeenCalledWith('photo-a')
  })

  it('normalizes blank captions to null and validates positions', async () => {
    const prepared = {
      blob: new Blob(['prepared'], { type: 'image/jpeg' }),
      width: 640,
      height: 480,
      mimeType: 'image/jpeg' as const,
      extension: 'jpg' as const,
    }
    const cache = { put: vi.fn(async () => undefined), delete: vi.fn(async () => true) }
    const queue = { enqueue: vi.fn(async () => undefined) }

    const job = await enqueuePreparedPhoto({
      file,
      pairId: 'pair-a', ownerType: 'recipe', ownerId: 'recipe-a', position: 0,
      caption: '   ', mediaId: 'photo-a', prepare: vi.fn(async () => prepared), cache, queue,
    })
    expect(job.caption).toBeNull()

    await expect(enqueuePreparedPhoto({
      file,
      pairId: 'pair-a', ownerType: 'recipe', ownerId: 'recipe-a', position: -1,
      mediaId: 'photo-b', prepare: vi.fn(async () => prepared), cache, queue,
    })).rejects.toThrow('position')
  })
})
