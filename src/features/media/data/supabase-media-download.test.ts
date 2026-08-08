import { describe, expect, it, vi } from 'vitest'
import { SupabaseMediaDownload } from './supabase-media-download'

describe('SupabaseMediaDownload', () => {
  it('downloads a storage object as a Blob from the configured bucket', async () => {
    const blob = new Blob(['image'], { type: 'image/webp' })
    const download = vi.fn(async () => ({ data: blob, error: null }))
    const from = vi.fn(() => ({ download }))
    const client = { storage: { from } }
    const media = new SupabaseMediaDownload(client, 'recipe-media')

    await expect(media.download('pairs/pair-a/photo.webp')).resolves.toBe(blob)
    expect(from).toHaveBeenCalledWith('recipe-media')
    expect(download).toHaveBeenCalledWith('pairs/pair-a/photo.webp')
  })

  it('surfaces Storage download errors', async () => {
    const client = {
      storage: {
        from: vi.fn(() => ({ download: vi.fn(async () => ({ data: null, error: { message: 'not found' } })) })),
      },
    }
    const media = new SupabaseMediaDownload(client, 'recipe-media')

    await expect(media.download('missing.webp')).rejects.toThrow('not found')
  })
})
