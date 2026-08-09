import { describe, expect, it } from 'vitest'
import { COMPLETE_BACKUP_DATA_PATHS, encodeBackupJson, sha256Hex } from '../domain/complete-backup-format'
import type { CompleteBackupSnapshot } from './complete-backup-snapshot'
import { prepareCompleteBackup } from './complete-backup-archive'

const pairId = '20000000-0000-4000-8000-000000000002'
const createdAt = '2026-08-09T10:00:00.000Z'

function snapshot(photoSha256: string | null): CompleteBackupSnapshot {
  return {
    pairId,
    createdAt,
    dataEntries: COMPLETE_BACKUP_DATA_PATHS.map((path) => ({
      path,
      bytes: encodeBackupJson(path === 'data/pair.json' ? { sourcePairId: pairId } : []),
    })),
    photos: [{
      id: 'photo-1',
      pair_id: pairId,
      recipe_id: 'recipe-1',
      storage_path: `${pairId}/owner/photo-1.webp`,
      storage_state: 'uploaded',
      mime_type: 'image/webp',
      sha256: photoSha256,
      deleted_at: null,
      ownerType: 'recipe',
    }],
  }
}

describe('prepareCompleteBackup', () => {
  it('creates checksummed descriptors for canonical data and media', async () => {
    const mediaBytes = new TextEncoder().encode('fake-webp-binary')
    const mediaSha = await sha256Hex(mediaBytes)
    const prepared = await prepareCompleteBackup({
      snapshot: snapshot(mediaSha),
      mediaFiles: [{
        id: 'photo-1',
        blob: new Blob([mediaBytes], { type: 'image/webp' }),
        mediaType: 'image/webp',
        expectedSha256: mediaSha,
      }],
      appVersion: '0.0.0-test',
      pairExportId: 'export-1',
    })

    expect(prepared.manifest).toMatchObject({
      format: 'receitas-backup',
      version: 1,
      appVersion: '0.0.0-test',
      pairExportId: 'export-1',
    })
    expect(prepared.manifest.dataFiles).toHaveLength(COMPLETE_BACKUP_DATA_PATHS.length)
    expect(prepared.manifest.mediaFiles).toEqual([{
      path: 'media/photo-1.webp',
      mediaType: 'image/webp',
      bytes: mediaBytes.byteLength,
      sha256: mediaSha,
    }])
  })

  it('rejects a downloaded original whose checksum differs from canonical metadata', async () => {
    await expect(prepareCompleteBackup({
      snapshot: snapshot('0'.repeat(64)),
      mediaFiles: [{
        id: 'photo-1',
        blob: new Blob(['different bytes'], { type: 'image/webp' }),
        mediaType: 'image/webp',
        expectedSha256: '0'.repeat(64),
      }],
      appVersion: '0.0.0-test',
    })).rejects.toThrow('checksum mismatch')
  })

  it('requires exactly one binary for every canonical photo', async () => {
    await expect(prepareCompleteBackup({
      snapshot: snapshot(null),
      mediaFiles: [],
      appVersion: '0.0.0-test',
    })).rejects.toThrow('missing downloaded media photo-1')

    const extraSnapshot = snapshot(null)
    await expect(prepareCompleteBackup({
      snapshot: extraSnapshot,
      mediaFiles: [
        { id: 'photo-1', blob: new Blob(['one'], { type: 'image/webp' }), mediaType: 'image/webp', expectedSha256: null },
        { id: 'photo-extra', blob: new Blob(['two'], { type: 'image/webp' }), mediaType: 'image/webp', expectedSha256: null },
      ],
      appVersion: '0.0.0-test',
    })).rejects.toThrow('has no canonical photo metadata')
  })

  it('rejects MIME mismatches instead of silently changing archive extensions', async () => {
    await expect(prepareCompleteBackup({
      snapshot: snapshot(null),
      mediaFiles: [{
        id: 'photo-1',
        blob: new Blob(['jpeg bytes'], { type: 'image/jpeg' }),
        mediaType: 'image/jpeg',
        expectedSha256: null,
      }],
      appVersion: '0.0.0-test',
    })).rejects.toThrow('Canonical media type mismatch')
  })
})
