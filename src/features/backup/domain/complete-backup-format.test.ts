import { describe, expect, it } from 'vitest'
import {
  COMPLETE_BACKUP_DATA_PATHS,
  assertBackupValueHasNoSecrets,
  backupFilename,
  createBackupManifest,
  encodeBackupJson,
  sha256Hex,
} from './complete-backup-format'

const checksum = 'a'.repeat(64)

function requiredDataFiles() {
  return COMPLETE_BACKUP_DATA_PATHS.map((path) => ({ path, sha256: checksum, bytes: 2 }))
}

describe('complete backup format', () => {
  it('builds a deterministic version-1 manifest with sorted entries', () => {
    const manifest = createBackupManifest({
      createdAt: '2026-08-09T10:00:00.000Z',
      appVersion: '0.0.0',
      pairExportId: 'export-1',
      dataFiles: [...requiredDataFiles()].reverse(),
      mediaFiles: [
        { path: 'media/photo-b.jpg', sha256: checksum, bytes: 20, mediaType: 'image/jpeg' },
        { path: 'media/photo-a.webp', sha256: checksum, bytes: 10, mediaType: 'image/webp' },
      ],
    })

    expect(manifest).toMatchObject({
      format: 'receitas-backup',
      version: 1,
      createdAt: '2026-08-09T10:00:00.000Z',
      appVersion: '0.0.0',
      pairExportId: 'export-1',
    })
    expect(manifest.dataFiles.map((entry) => entry.path)).toEqual(
      [...COMPLETE_BACKUP_DATA_PATHS].sort((a, b) => a.localeCompare(b)),
    )
    expect(manifest.mediaFiles.map((entry) => entry.path)).toEqual([
      'media/photo-a.webp',
      'media/photo-b.jpg',
    ])
  })

  it('requires every canonical data file and unique safe paths', () => {
    expect(() => createBackupManifest({
      createdAt: '2026-08-09T10:00:00.000Z',
      appVersion: '0.0.0',
      pairExportId: 'export-1',
      dataFiles: requiredDataFiles().slice(1),
      mediaFiles: [],
    })).toThrow('missing required data entries')

    expect(() => createBackupManifest({
      createdAt: '2026-08-09T10:00:00.000Z',
      appVersion: '0.0.0',
      pairExportId: 'export-1',
      dataFiles: requiredDataFiles(),
      mediaFiles: [{ path: 'media/../secret.txt', sha256: checksum, bytes: 1, mediaType: 'image/jpeg' }],
    })).toThrow('Invalid backup entry path')
  })

  it('rejects credentials and sessions by field name before serialization', () => {
    expect(() => assertBackupValueHasNoSecrets({ recipe: { title: 'Bolo' }, access_token: 'secret' })).toThrow(
      'forbidden field',
    )
    expect(() => assertBackupValueHasNoSecrets({ nested: { password: 'secret' } })).toThrow('forbidden field')
    expect(() => assertBackupValueHasNoSecrets({ note: 'a palavra password pode existir no texto da receita' })).not.toThrow()
  })

  it('serializes object keys deterministically and hashes exact bytes', async () => {
    const encoded = encodeBackupJson({ z: 1, a: { d: 4, b: 2 } })
    expect(new TextDecoder().decode(encoded)).toBe('{\n  "a": {\n    "b": 2,\n    "d": 4\n  },\n  "z": 1\n}\n')
    expect(await sha256Hex(encoded)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('uses an ISO-derived filename without path separators', () => {
    expect(backupFilename('2026-08-09T10:00:00.000Z')).toBe('receitas-backup-2026-08-09T10-00-00-000Z.zip')
  })
})
