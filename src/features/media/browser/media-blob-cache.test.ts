import { describe, expect, it, vi } from 'vitest'
import { BrowserMediaBlobCache, type MediaCacheRuntime } from './media-blob-cache'

function fakeRuntime() {
  const values = new Map<string, Response>()
  const cache = {
    put: vi.fn(async (request: Request, response: Response) => { values.set(request.url, response) }),
    match: vi.fn(async (request: Request) => values.get(request.url)),
    delete: vi.fn(async (request: Request) => values.delete(request.url)),
  }
  const runtime: MediaCacheRuntime = {
    origin: 'https://receitas.test',
    open: vi.fn(async () => cache),
  }
  return { runtime, cache, values }
}

describe('BrowserMediaBlobCache', () => {
  it('stores and restores prepared binary media by stable media id', async () => {
    const { runtime } = fakeRuntime()
    const media = new BrowserMediaBlobCache(runtime)
    const source = new Blob(['image'], { type: 'image/webp' })

    await media.put('photo-a', source)
    const restored = await media.get('photo-a')

    expect(restored).not.toBeNull()
    expect(restored?.type).toBe('image/webp')
    expect(await restored?.text()).toBe('image')
  })

  it('returns null for a cache miss instead of throwing', async () => {
    const { runtime } = fakeRuntime()
    const media = new BrowserMediaBlobCache(runtime)
    await expect(media.get('missing')).resolves.toBeNull()
  })

  it('deletes only the requested cached blob', async () => {
    const { runtime } = fakeRuntime()
    const media = new BrowserMediaBlobCache(runtime)
    await media.put('photo-a', new Blob(['a'], { type: 'image/webp' }))
    await media.put('photo-b', new Blob(['b'], { type: 'image/webp' }))

    await media.delete('photo-a')

    await expect(media.get('photo-a')).resolves.toBeNull()
    expect(await (await media.get('photo-b'))?.text()).toBe('b')
  })

  it('encodes ids into same-origin cache keys so arbitrary ids cannot escape the media namespace', async () => {
    const { runtime, cache } = fakeRuntime()
    const media = new BrowserMediaBlobCache(runtime)

    await media.put('../photo with spaces', new Blob(['x'], { type: 'image/webp' }))

    const request = cache.put.mock.calls[0]?.[0]
    expect(request?.url).toBe('https://receitas.test/__receitas_media/..%2Fphoto%20with%20spaces')
  })
})
