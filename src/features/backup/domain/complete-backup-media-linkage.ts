import type { BackupManifest, BackupMediaFileDescriptor } from './complete-backup-format'

const EXTENSION_BY_MEDIA_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as Record<string, unknown>
}

function photoPath(row: Record<string, unknown>): { id: string; path: string; mediaType: string } {
  const id = typeof row.id === 'string' ? row.id : ''
  const mediaType = typeof row.mime_type === 'string' ? row.mime_type : ''
  if (!/^[0-9A-Za-z_-]+$/.test(id)) throw new Error('Backup photo id is invalid')
  const extension = EXTENSION_BY_MEDIA_TYPE[mediaType]
  if (!extension) throw new Error(`Backup photo MIME type is unsupported: ${mediaType}`)
  return { id, path: `media/${id}.${extension}`, mediaType }
}

function descriptorByPath(manifest: BackupManifest): Map<string, BackupMediaFileDescriptor> {
  return new Map(manifest.mediaFiles.map((entry) => [entry.path, entry]))
}

export function validateBackupPhotoMediaLinkage(manifest: BackupManifest, data: Map<string, unknown>): void {
  const rawPhotos = data.get('data/photo-metadata.json')
  if (!Array.isArray(rawPhotos)) throw new Error('Backup photo metadata must be an array')
  if (rawPhotos.length !== manifest.mediaFiles.length) {
    throw new Error('Backup photo metadata count does not match media entries')
  }

  const descriptors = descriptorByPath(manifest)
  for (const [index, value] of rawPhotos.entries()) {
    const row = record(value, `Backup photo metadata ${index}`)
    const expected = photoPath(row)
    const descriptor = descriptors.get(expected.path)
    if (!descriptor) throw new Error(`Backup photo ${expected.id} has no matching media file`)
    if (descriptor.mediaType !== expected.mediaType) {
      throw new Error(`Backup photo ${expected.id} MIME type differs from media descriptor`)
    }
    if (row.storage_state !== 'uploaded') throw new Error(`Backup photo ${expected.id} is not marked uploaded`)

    if (row.sha256 !== null && row.sha256 !== undefined) {
      if (typeof row.sha256 !== 'string' || descriptor.sha256 !== row.sha256) {
        throw new Error(`Backup photo ${expected.id} checksum differs from media descriptor`)
      }
    }
    if (row.byte_size !== null && row.byte_size !== undefined) {
      if (typeof row.byte_size !== 'number' || descriptor.bytes !== row.byte_size) {
        throw new Error(`Backup photo ${expected.id} byte size differs from media descriptor`)
      }
    }
  }
}
