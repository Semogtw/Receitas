import { validateRestorePhotoMediaLinkage } from './media-linkage.ts'
import type { RestoreManifest } from './validation.ts'

function assertThrows(action: () => unknown, contains: string): void {
  try {
    action()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes(contains)) throw new Error(`Expected ${contains}, got ${message}`)
    return
  }
  throw new Error(`Expected throw containing ${contains}`)
}

const checksum = 'a'.repeat(64)
const manifest: RestoreManifest = {
  format: 'receitas-backup',
  version: 1,
  createdAt: '2026-08-09T10:00:00.000Z',
  appVersion: '1.0.0',
  pairExportId: 'export-1',
  dataFiles: [],
  mediaFiles: [{ path: 'media/photo-1.webp', sha256: checksum, bytes: 123, mediaType: 'image/webp' }],
}

function data(photo: Record<string, unknown>): Map<string, unknown> {
  return new Map([['data/photo-metadata.json', [photo]]])
}

Deno.test('restore server accepts only exact photo digest, size and mime linkage', () => {
  validateRestorePhotoMediaLinkage(manifest, data({
    id: 'photo-1',
    mime_type: 'image/webp',
    storage_state: 'uploaded',
    sha256: checksum,
    byte_size: 123,
  }))
})

Deno.test('restore server rejects missing photo checksum or byte size before commit', () => {
  assertThrows(() => validateRestorePhotoMediaLinkage(manifest, data({
    id: 'photo-1',
    mime_type: 'image/webp',
    storage_state: 'uploaded',
    sha256: null,
    byte_size: 123,
  })), 'restore_photo_checksum_missing')

  assertThrows(() => validateRestorePhotoMediaLinkage(manifest, data({
    id: 'photo-1',
    mime_type: 'image/webp',
    storage_state: 'uploaded',
    sha256: checksum,
    byte_size: null,
  })), 'restore_photo_size_missing')
})

Deno.test('restore server rejects metadata that points at another binary descriptor', () => {
  assertThrows(() => validateRestorePhotoMediaLinkage(manifest, data({
    id: 'photo-1',
    mime_type: 'image/webp',
    storage_state: 'uploaded',
    sha256: 'b'.repeat(64),
    byte_size: 123,
  })), 'restore_photo_checksum_mismatch')

  assertThrows(() => validateRestorePhotoMediaLinkage(manifest, data({
    id: 'photo-1',
    mime_type: 'image/webp',
    storage_state: 'uploaded',
    sha256: checksum,
    byte_size: 124,
  })), 'restore_photo_size_mismatch')
})
