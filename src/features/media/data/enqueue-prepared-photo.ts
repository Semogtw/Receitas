import { prepareImageForUpload, type PreparedImage } from '../browser/prepare-image'
import type { MediaUploadJob, MediaUploadOwnerType } from './media-upload-queue'

interface PreparedPhotoCache {
  put(mediaId: string, blob: Blob): Promise<void>
  delete(mediaId: string): Promise<boolean>
}

interface PreparedPhotoQueue {
  enqueue(job: MediaUploadJob): Promise<void>
}

interface EnqueuePreparedPhotoInput {
  file: Blob
  pairId: string
  ownerType: MediaUploadOwnerType
  ownerId: string
  position: number
  caption?: string | null
  mediaId?: string
  now?: string
  prepare?: (file: Blob) => Promise<PreparedImage>
  hash?: (blob: Blob) => Promise<string>
  cache: PreparedPhotoCache
  queue: PreparedPhotoQueue
}

function cleanRequired(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${label} is required`)
  return trimmed
}

function cleanCaption(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

async function sha256Blob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function enqueuePreparedPhoto(input: EnqueuePreparedPhotoInput): Promise<MediaUploadJob> {
  const pairId = cleanRequired(input.pairId, 'Pair id')
  const ownerId = cleanRequired(input.ownerId, 'Owner id')
  if (!Number.isSafeInteger(input.position) || input.position < 0) {
    throw new Error('Photo position must be a non-negative integer')
  }

  const mediaId = cleanRequired(input.mediaId ?? crypto.randomUUID(), 'Media id')
  const prepared = await (input.prepare ?? prepareImageForUpload)(input.file)
  const sha256 = (await (input.hash ?? sha256Blob)(prepared.blob)).trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error('Prepared media checksum is invalid')

  const job: MediaUploadJob = {
    version: 1,
    id: mediaId,
    pairId,
    ownerType: input.ownerType,
    ownerId,
    mimeType: prepared.mimeType,
    extension: prepared.extension,
    width: prepared.width,
    height: prepared.height,
    sizeBytes: prepared.blob.size,
    sha256,
    position: input.position,
    caption: cleanCaption(input.caption),
    createdAt: input.now ?? new Date().toISOString(),
    state: 'pending',
    attempts: 0,
    lastError: null,
  }

  await input.cache.put(mediaId, prepared.blob)
  try {
    await input.queue.enqueue(job)
    return job
  } catch (cause) {
    await input.cache.delete(mediaId)
    throw cause
  }
}
