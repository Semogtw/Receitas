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
  it('stores and restores prepared binary media inside the active pair namespace', async () => {
    const { runtime } = fakeRuntime()
    const media = new BrowserMediaBlobCache('pair-a', runtime)
    const source = new Blob(['image'], { type: 'image/webp' })

    await media.put('photo-a', source)
    const restored = await media.get('photo-a')

    expect(restored).not.toBeNull()
    expect(restored?.type).toBe('image/webp')
    expect(await restored?.text()).toBe('image')
  })

  it('does not expose the same media id through another pair scope', async () => {
    const { runtime } = fakeRuntime()
    const firstPair = new BrowserMediaBlobCache('pair-a', runtime)
    const secondPair = new BrowserMediaBlobCache('pair-b', runtime)

    await firstPair.put('photo-a', new Blob(['private-a'], { type: 'image/webp' }))

    await expect(secondPair.get('photo-a')).resolves.toBeNull()
    expect(await (await firstPair.get('photo-a'))?.text()).toBe('private-a')
  })

  it('returns null for a cache miss instead of throwing', async () => {
    const { runtime } = fakeRuntime()
    const media = new BrowserMediaBlobCache('pair-a', runtime)
    await expect(media.get('missing')).resolves.toBeNull()
  })

  it('deletes only the requested cached blob in the active pair scope', async () => {
    const { runtime } = fakeRuntime()
    const media = new BrowserMediaBlobCache('pair-a', runtime)
    await media.put('photo-a', new Blob(['a'], { type: 'image/webp' }))
    await media.put('photo-b', new Blob(['b'], { type: 'image/webp' }))

    await media.delete('photo-a')

    await expect(media.get('photo-a')).resolves.toBeNull()
    expect(await (await media.get('photo-b'))?.text()).toBe('b')
  })

  it('encodes pair and media ids into same-origin keys so arbitrary values cannot escape the namespace', async () => {
    const { runtime, cache } = fakeRuntime()
    const media = new BrowserMediaBlobCache('../pair with spaces', runtime)

    await media.put('../photo with spaces', new Blob(['x'], { type: 'image/webp' }))

    const request = cache.put.mock.calls[0]?.[0]
    expect(request?.url).toBe('https://receitas.test/__receitas_media/pairs/..%2Fpair%20with%20spaces/..%2Fphoto%20with%20spaces')
  })

  it('migrates a legacy unscoped blob only when a durable job proves the current pair scope', async () => {
    const { runtime, cache, values } = fakeRuntime()
    values.set(
      'https://receitas.test/__receitas_media/photo-a',
      new Response(new Blob(['legacy'], { type: 'image/webp' })),
    )
    const media = new BrowserMediaBlobCache('pair-a', runtime)

    const migrated = await media.getForUpload({ id: 'photo-a', pairId: 'pair-a' })

    expect(await migrated?.text()).toBe('legacy')
    await expect(media.get('photo-a')).resolves.not.toBeNull()
    expect(values.has('https://receitas.test/__receitas_media/photo-a')).toBe(false)
    expect(cache.delete).toHaveBeenCalled()
  })

  it('never returns or deletes a legacy blob for a job from another pair', async () => {
    const { runtime, values } = fakeRuntime()
    values.set(
      'https://receitas.test/__receitas_media/photo-a',
      new Response(new Blob(['legacy'], { type: 'image/webp' })),
    )
    const media = new BrowserMediaBlobCache('pair-a', runtime)

    await expect(media.getForUpload({ id: 'photo-a', pairId: 'pair-b' })).rejects.toThrow('active cache scope')
    await expect(media.deleteForUpload({ id: 'photo-a', pairId: 'pair-b' })).rejects.toThrow('active cache scope')
    expect(values.has('https://receitas.test/__receitas_media/photo-a')).toBe(true)
  })
})
