export interface ImagePreparationPolicy {
  maxLongEdge: number
  mimeType: 'image/webp' | 'image/jpeg'
  quality: number
}

export interface ImageDimensions {
  width: number
  height: number
}

export const DEFAULT_IMAGE_PREPARATION: ImagePreparationPolicy = {
  maxLongEdge: 1600,
  mimeType: 'image/webp',
  quality: 0.82,
}

function assertPixelDimension(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`)
  if (!Number.isInteger(value)) throw new Error(`${label} must be an integer number of pixels`)
  if (value <= 0) throw new Error(`${label} must be positive`)
}

export function fitImageWithinBounds(
  sourceWidth: number,
  sourceHeight: number,
  maxLongEdge = DEFAULT_IMAGE_PREPARATION.maxLongEdge,
): ImageDimensions {
  assertPixelDimension(sourceWidth, 'Image width')
  assertPixelDimension(sourceHeight, 'Image height')
  assertPixelDimension(maxLongEdge, 'Maximum image edge')

  const longEdge = Math.max(sourceWidth, sourceHeight)
  if (longEdge <= maxLongEdge) return { width: sourceWidth, height: sourceHeight }

  const scale = maxLongEdge / longEdge
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  }
}

export function normalizedOutputExtension(mimeType: ImagePreparationPolicy['mimeType']): 'webp' | 'jpg' {
  if (mimeType === 'image/webp') return 'webp'
  if (mimeType === 'image/jpeg') return 'jpg'
  throw new Error(`Unsupported image output MIME type: ${String(mimeType)}`)
}
