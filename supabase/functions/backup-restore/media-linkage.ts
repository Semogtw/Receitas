import type { RestoreManifest } from './validation.ts'

const EXTENSION_BY_MEDIA_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}_invalid`)
  return value as Record<string, unknown>
}

export function validateRestorePhotoMediaLinkage(manifest: RestoreManifest, data: Map<string, unknown>): void {
  const value = data.get('data/photo-metadata.json')
  if (!Array.isArray(value)) throw new Error('restore_photo_metadata_invalid')
  if (value.length !== manifest.mediaFiles.length) throw new Error('restore_photo_media_count_mismatch')

  const byPath = new Map(manifest.mediaFiles.map((entry) => [entry.path, entry]))
  for (const [index, raw] of value.entries()) {
    const row = record(raw, `restore_photo_${index}`)
    const id = typeof row.id === 'string' ? row.id : ''
    const mediaType = typeof row.mime_type === 'string' ? row.mime_type : ''
    if (!/^[0-9A-Za-z_-]+$/.test(id)) throw new Error('restore_photo_id_invalid')
    const extension = EXTENSION_BY_MEDIA_TYPE[mediaType]
    if (!extension) throw new Error('restore_photo_media_type_invalid')
    const path = `media/${id}.${extension}`
    const descriptor = byPath.get(path)
    if (!descriptor) throw new Error(`restore_photo_media_missing:${id}`)
    if (descriptor.mediaType !== mediaType) throw new Error(`restore_photo_media_type_mismatch:${id}`)
    if (row.storage_state !== 'uploaded') throw new Error(`restore_photo_not_uploaded:${id}`)

    if (row.sha256 !== null && row.sha256 !== undefined) {
      if (typeof row.sha256 !== 'string' || row.sha256 !== descriptor.sha256) {
        throw new Error(`restore_photo_checksum_mismatch:${id}`)
      }
    }
    if (row.byte_size !== null && row.byte_size !== undefined) {
      if (typeof row.byte_size !== 'number' || row.byte_size !== descriptor.bytes) {
        throw new Error(`restore_photo_size_mismatch:${id}`)
      }
    }
  }
}
