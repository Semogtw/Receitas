import { describe, expect, it, vi } from 'vitest'
import { SupabaseMediaStorage } from './supabase-media-storage'

describe('SupabaseMediaStorage', () => {
  it('uploads with deterministic overwrite semantics and the prepared MIME type', async () => {
    const upload = vi.fn(async () => ({ data: { path: 'x' }, error: null }))
    const from = vi.fn(() => ({ upload }))
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
        upsert: true,
        cacheControl: '31536000',
      }),
    )
  })

  it('surfaces Storage errors so the local worker keeps the job recoverable', async () => {
    const upload = vi.fn(async () => ({ data: null, error: { message: 'bucket unavailable' } }))
    const client = { storage: { from: vi.fn(() => ({ upload })) } }
    const storage = new SupabaseMediaStorage(client, 'recipe-media')

    await expect(storage.upload('pairs/pair-a/x.webp', new Blob(['x']), 'image/webp'))
      .rejects.toThrow('bucket unavailable')
  })

  it('rejects an empty bucket at construction time', () => {
    expect(() => new SupabaseMediaStorage({ storage: { from: vi.fn() } }, '   ')).toThrow('bucket')
  })
})
