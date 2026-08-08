import { describe, expect, it, vi } from 'vitest'
import { prepareImageForUpload, type ImagePreparationRuntime } from './prepare-image'

const sourceFile = new File(['source'], 'photo.jpg', { type: 'image/jpeg' })

describe('prepareImageForUpload', () => {
  it('decodes once, resizes by policy and encodes WebP by default', async () => {
    const close = vi.fn()
    const runtime: ImagePreparationRuntime = {
      decode: vi.fn(async () => ({ source: {} as CanvasImageSource, width: 4032, height: 3024, close })),
      encode: vi.fn(async (_source, dimensions, mimeType, quality) => {
        expect(dimensions).toEqual({ width: 1600, height: 1200 })
        expect(mimeType).toBe('image/webp')
        expect(quality).toBe(0.82)
        return new Blob(['webp'], { type: 'image/webp' })
      }),
    }

    const prepared = await prepareImageForUpload(sourceFile, undefined, runtime)

    expect(prepared).toMatchObject({ width: 1600, height: 1200, mimeType: 'image/webp', extension: 'webp' })
    expect(prepared.blob.type).toBe('image/webp')
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('falls back to JPEG when WebP encoding is unavailable and reports the actual output type', async () => {
    const runtime: ImagePreparationRuntime = {
      decode: vi.fn(async () => ({ source: {} as CanvasImageSource, width: 800, height: 600, close: vi.fn() })),
      encode: vi.fn(async (_source, _dimensions, mimeType) => {
        if (mimeType === 'image/webp') return null
        return new Blob(['jpeg'], { type: 'image/jpeg' })
      }),
    }

    const prepared = await prepareImageForUpload(sourceFile, undefined, runtime)

    expect(prepared).toMatchObject({ width: 800, height: 600, mimeType: 'image/jpeg', extension: 'jpg' })
    expect(runtime.encode).toHaveBeenCalledTimes(2)
  })

  it('always releases decoded image resources even when encoding fails', async () => {
    const close = vi.fn()
    const runtime: ImagePreparationRuntime = {
      decode: vi.fn(async () => ({ source: {} as CanvasImageSource, width: 800, height: 600, close })),
      encode: vi.fn(async () => null),
    }

    await expect(prepareImageForUpload(sourceFile, undefined, runtime)).rejects.toThrow('encode')
    expect(close).toHaveBeenCalledTimes(1)
  })
})
