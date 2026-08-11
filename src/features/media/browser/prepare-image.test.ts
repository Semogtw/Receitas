import { describe, expect, it, vi } from 'vitest'
import {
  MAX_PREPARED_IMAGE_BYTES,
  MAX_SOURCE_IMAGE_BYTES,
  prepareImageForUpload,
  type ImagePreparationRuntime,
} from './prepare-image'

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

  it('falls back when a browser returns a different MIME type than the requested WebP encoding', async () => {
    const runtime: ImagePreparationRuntime = {
      decode: vi.fn(async () => ({ source: {} as CanvasImageSource, width: 800, height: 600, close: vi.fn() })),
      encode: vi.fn(async (_source, _dimensions, mimeType) => (
        mimeType === 'image/webp'
          ? new Blob(['png-fallback'], { type: 'image/png' })
          : new Blob(['jpeg'], { type: 'image/jpeg' })
      )),
    }

    const prepared = await prepareImageForUpload(sourceFile, undefined, runtime)
    expect(prepared.mimeType).toBe('image/jpeg')
    expect(prepared.extension).toBe('jpg')
  })

  it('rejects vector/unknown source types and oversized source files before decode', async () => {
    const runtime: ImagePreparationRuntime = {
      decode: vi.fn(),
      encode: vi.fn(),
    }

    await expect(prepareImageForUpload(
      { type: 'image/svg+xml', size: 128 } as Blob,
      undefined,
      runtime,
    )).rejects.toThrow('Unsupported source image type')

    await expect(prepareImageForUpload(
      { type: 'image/jpeg', size: MAX_SOURCE_IMAGE_BYTES + 1 } as Blob,
      undefined,
      runtime,
    )).rejects.toThrow('size limit')

    expect(runtime.decode).not.toHaveBeenCalled()
  })

  it('rejects empty or oversized encoded output instead of queueing a mislabeled Storage object', async () => {
    const close = vi.fn()
    const oversized = {
      type: 'image/webp',
      size: MAX_PREPARED_IMAGE_BYTES + 1,
    } as Blob
    const runtime: ImagePreparationRuntime = {
      decode: vi.fn(async () => ({ source: {} as CanvasImageSource, width: 800, height: 600, close })),
      encode: vi.fn(async (_source, _dimensions, mimeType) => (
        mimeType === 'image/webp'
          ? oversized
          : ({ type: 'image/jpeg', size: 0 } as Blob)
      )),
    }

    await expect(prepareImageForUpload(sourceFile, undefined, runtime)).rejects.toThrow('bounded image')
    expect(close).toHaveBeenCalledTimes(1)
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
