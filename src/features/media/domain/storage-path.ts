import type { MediaUploadOwnerType } from '../data/media-upload-queue'

interface MediaStoragePathInput {
  pairId: string
  ownerType: MediaUploadOwnerType
  ownerId: string
  mediaId: string
  extension: 'webp' | 'jpg'
}

const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/

function safeSegment(value: string, label: string): string {
  if (!SAFE_SEGMENT.test(value)) throw new Error(`${label} contains an unsafe path segment`)
  return value
}

export function buildMediaStoragePath(input: MediaStoragePathInput): string {
  const pairId = safeSegment(input.pairId, 'Pair id')
  const ownerId = safeSegment(input.ownerId, 'Owner id')
  const mediaId = safeSegment(input.mediaId, 'Media id')
  const ownerFolder = input.ownerType === 'recipe' ? 'recipes' : 'cooking-sessions'
  return `pairs/${pairId}/${ownerFolder}/${ownerId}/${mediaId}.${input.extension}`
}
