import { describe, expect, it, vi } from 'vitest'
import { resolveMediaBlob } from './resolve-media-blob'

describe('resolveMediaBlob', () => {
  it('returns local cached media without touching the network', async () => {
    const cached = new Blob(['cached'], { type: 'image/webp' })
    const cache = { get: vi.fn(async () => cached), put: vi.fn(async () => undefined) }
    const remote = { download: vi.fn() }

    const result = await resolveMediaBlob('photo-a', 'path/a.webp', { cache, remote })

    expect(result).toBe(cached)
    expect(remote.download).not.toHaveBeenCalled()
  })

  it('downloads a cache miss once and stores it for later offline reads', async () => {
    const downloaded = new Blob(['remote'], { type: 'image/webp' })
    const cache = { get: vi.fn(async () => null), put: vi.fn(async () => undefined) }
    const remote = { download: vi.fn(async () => downloaded) }

    const result = await resolveMediaBlob('photo-a', 'pairs/pair-a/photo-a.webp', { cache, remote })

    expect(result).toBe(downloaded)
    expect(remote.download).toHaveBeenCalledWith('pairs/pair-a/photo-a.webp')
    expect(cache.put).toHaveBeenCalledWith('photo-a', downloaded)
  })

  it('does not write anything when remote download fails', async () => {
    const cache = { get: vi.fn(async () => null), put: vi.fn(async () => undefined) }
    const remote = { download: vi.fn(async () => { throw new Error('offline') }) }

    await expect(resolveMediaBlob('photo-a', 'path/a.webp', { cache, remote })).rejects.toThrow('offline')
    expect(cache.put).not.toHaveBeenCalled()
  })
})
