import {
  DEFAULT_IMAGE_PREPARATION,
  fitImageWithinBounds,
  normalizedOutputExtension,
  type ImageDimensions,
  type ImagePreparationPolicy,
} from '../domain/image-preparation'

export const MAX_SOURCE_IMAGE_BYTES = 32 * 1024 * 1024
export const MAX_PREPARED_IMAGE_BYTES = 20 * 1024 * 1024

const SUPPORTED_SOURCE_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'image/heic',
  'image/heif',
])

export interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  close(): void
}

export interface ImagePreparationRuntime {
  decode(file: Blob): Promise<DecodedImage>
  encode(
    source: CanvasImageSource,
    dimensions: ImageDimensions,
    mimeType: 'image/webp' | 'image/jpeg',
    quality: number,
  ): Promise<Blob | null>
}

export interface PreparedImage {
  blob: Blob
  width: number
  height: number
  mimeType: 'image/webp' | 'image/jpeg'
  extension: 'webp' | 'jpg'
}

async function defaultDecode(file: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap !== 'function') {
    throw new Error('This browser cannot decode images for offline preparation')
  }
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  return {
    source: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    close: () => bitmap.close(),
  }
}

async function defaultEncode(
  source: CanvasImageSource,
  dimensions: ImageDimensions,
  mimeType: 'image/webp' | 'image/jpeg',
  quality: number,
): Promise<Blob | null> {
  if (typeof document === 'undefined') {
    throw new Error('Image encoding requires a browser document')
  }

  const canvas = document.createElement('canvas')
  canvas.width = dimensions.width
  canvas.height = dimensions.height
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('Canvas 2D is unavailable for image preparation')

  context.drawImage(source, 0, 0, dimensions.width, dimensions.height)
  return new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality))
}

const defaultRuntime: ImagePreparationRuntime = {
  decode: defaultDecode,
  encode: defaultEncode,
}

function encodedBlobMatches(blob: Blob | null, expectedMimeType: 'image/webp' | 'image/jpeg'): blob is Blob {
  return Boolean(
    blob
    && blob.size > 0
    && blob.size <= MAX_PREPARED_IMAGE_BYTES
    && blob.type.toLowerCase() === expectedMimeType,
  )
}

export async function prepareImageForUpload(
  file: Blob,
  policy: ImagePreparationPolicy = DEFAULT_IMAGE_PREPARATION,
  runtime: ImagePreparationRuntime = defaultRuntime,
): Promise<PreparedImage> {
  const sourceType = file.type.toLowerCase()
  if (!SUPPORTED_SOURCE_IMAGE_TYPES.has(sourceType)) {
    throw new Error('Unsupported source image type')
  }
  if (file.size <= 0) throw new Error('Source image is empty')
  if (file.size > MAX_SOURCE_IMAGE_BYTES) throw new Error('Source image exceeds the local preparation size limit')
  if (!Number.isFinite(policy.quality) || policy.quality <= 0 || policy.quality > 1) {
    throw new Error('Image encoding quality must be greater than zero and at most one')
  }

  const decoded = await runtime.decode(file)
  try {
    const dimensions = fitImageWithinBounds(decoded.width, decoded.height, policy.maxLongEdge)
    const preferred = await runtime.encode(decoded.source, dimensions, policy.mimeType, policy.quality)
    if (encodedBlobMatches(preferred, policy.mimeType)) {
      const mimeType = policy.mimeType
      return {
        blob: preferred,
        ...dimensions,
        mimeType,
        extension: normalizedOutputExtension(mimeType),
      }
    }

    if (policy.mimeType !== 'image/jpeg') {
      const fallback = await runtime.encode(decoded.source, dimensions, 'image/jpeg', policy.quality)
      if (encodedBlobMatches(fallback, 'image/jpeg')) {
        return {
          blob: fallback,
          ...dimensions,
          mimeType: 'image/jpeg',
          extension: 'jpg',
        }
      }
    }

    throw new Error('The browser could not encode a bounded image in the requested format')
  } finally {
    decoded.close()
  }
}
