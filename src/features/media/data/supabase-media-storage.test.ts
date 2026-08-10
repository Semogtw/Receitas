import { describe, expect, it, vi } from 'vitest'
import { SupabaseMediaStorage } from './supabase-media-storage'

describe('SupabaseMediaStorage', () => {
  it('uploads without overwrite permission and with the prepared MIME type', async () => {
    const upload = vi.fn(async () => ({ data: { path: 'x' }, error: null }))
    const download = vi.fn(async () => ({ data: null, error: { message: 'not found' } }))
    const from = vi.fn(() => ({ upload, download }))
    const client = { storage: { from } }
    const storage = new SupabaseMediaStorage(client, 'recipe-media')
    const blob = new Blob(['image'], { type: 'image/webp' })

    await storage.upload('pairs/pair-a/recipes/recipe-a/photo-a.webp', blob, 'image/webp')

    expect(from).toHaveBeenCalledWith('recipe-media')
    expect(upload).toHaveBeenCalledWith(
      'pairs/pair-a/recipes/recipe-a/photo-a.webp',
      blob,
      expect.objectContaining({
        contentType: 'image/webp',
        upsert: false,
        cacheControl: '31536000',
      }),
    )
    expect(download).not.toHaveBeenCalled()
  })

  it('accepts a retry only when the object already stored at the path is byte-identical', async () => {
    const expected = new Blob(['same-image'], { type: 'image/webp' })
    const upload = vi.fn(async () => ({ data: null, error: { message: 'already exists' } }))
    const download = vi.fn(async () => ({
      data: new Blob(['same-image'], { type: 'image/webp' }),
      error: null,
    }))
    const storage = new SupabaseMediaStorage({
      storage: { from: vi.fn(() => ({ upload, download })) },
    }, 'recipe-media')

    await expect(storage.upload('pairs/pair-a/x.webp', expected, 'image/webp')).resolves.toBeUndefined()
    expect(download).toHaveBeenCalledWith('pairs/pair-a/x.webp')
  })

  it('refuses to overwrite an existing object with different bytes', async () => {
    const upload = vi.fn(async () => ({ data: null, error: { message: 'already exists' } }))
    const download = vi.fn(async () => ({
      data: new Blob(['other-image'], { type: 'image/webp' }),
      error: null,
    }))
    const storage = new SupabaseMediaStorage({
      storage: { from: vi.fn(() => ({ upload, download })) },
    }, 'recipe-media')

    await expect(storage.upload('pairs/pair-a/x.webp', new Blob(['expected']), 'image/webp'))
      .rejects.toThrow('already exists')
  })

  it('surfaces Storage errors when no matching object already exists', async () => {
    const upload = vi.fn(async () => ({ data: null, error: { message: 'bucket unavailable' } }))
    const download = vi.fn(async () => ({ data: null, error: { message: 'bucket unavailable' } }))
    const client = { storage: { from: vi.fn(() => ({ upload, download })) } }
    const storage = new SupabaseMediaStorage(client, 'recipe-media')

    await expect(storage.upload('pairs/pair-a/x.webp', new Blob(['x']), 'image/webp'))
      .rejects.toThrow('bucket unavailable')
  })

  it('rejects an empty bucket at construction time', () => {
    expect(() => new SupabaseMediaStorage({ storage: { from: vi.fn() } }, '   ')).toThrow('bucket')
  })
})
