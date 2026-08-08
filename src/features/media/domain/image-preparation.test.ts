import { describe, expect, it } from 'vitest'
import {
  DEFAULT_IMAGE_PREPARATION,
  fitImageWithinBounds,
  normalizedOutputExtension,
} from './image-preparation'

describe('image preparation policy', () => {
  it('limits the longest edge to 1600px without changing aspect ratio', () => {
    expect(DEFAULT_IMAGE_PREPARATION.maxLongEdge).toBe(1600)
    expect(fitImageWithinBounds(4032, 3024)).toEqual({ width: 1600, height: 1200 })
    expect(fitImageWithinBounds(3024, 4032)).toEqual({ width: 1200, height: 1600 })
  })

  it('does not upscale already-small images', () => {
    expect(fitImageWithinBounds(800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('rounds resized dimensions to positive integer pixels', () => {
    expect(fitImageWithinBounds(3000, 2000)).toEqual({ width: 1600, height: 1067 })
  })

  it('rejects invalid source dimensions instead of guessing', () => {
    expect(() => fitImageWithinBounds(0, 100)).toThrow('positive')
    expect(() => fitImageWithinBounds(Number.NaN, 100)).toThrow('finite')
    expect(() => fitImageWithinBounds(100.5, 200)).toThrow('integer')
  })

  it('uses a web-friendly extension that matches the encoded MIME type', () => {
    expect(normalizedOutputExtension('image/webp')).toBe('webp')
    expect(normalizedOutputExtension('image/jpeg')).toBe('jpg')
    expect(() => normalizedOutputExtension('image/png')).toThrow('Unsupported')
  })
})
