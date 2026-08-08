import { describe, expect, it } from 'vitest'
import { assertAcceptableSourceImage } from './source-image'
import { MEDIA_MAX_SOURCE_BYTES } from '../media-config'

describe('source image validation', () => {
  it('accepts common browser-decodable image MIME types within the source size limit', () => {
    expect(() => assertAcceptableSourceImage(new Blob(['x'], { type: 'image/jpeg' }))).not.toThrow()
    expect(() => assertAcceptableSourceImage(new Blob(['x'], { type: 'image/png' }))).not.toThrow()
    expect(() => assertAcceptableSourceImage(new Blob(['x'], { type: 'image/webp' }))).not.toThrow()
  })

  it('rejects non-images before attempting decode', () => {
    expect(() => assertAcceptableSourceImage(new Blob(['x'], { type: 'application/pdf' }))).toThrow('image')
  })

  it('rejects source files above 25 MiB before allocating image decode memory', () => {
    const oversized = { type: 'image/jpeg', size: MEDIA_MAX_SOURCE_BYTES + 1 } as Blob
    expect(() => assertAcceptableSourceImage(oversized)).toThrow('25 MiB')
  })

  it('rejects an empty image', () => {
    expect(() => assertAcceptableSourceImage(new Blob([], { type: 'image/jpeg' }))).toThrow('empty')
  })
})
