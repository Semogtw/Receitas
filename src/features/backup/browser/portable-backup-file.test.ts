import { describe, expect, it } from 'vitest'
import type { PortableBackupV1 } from '../domain/portable-backup'
import { createPortableBackupFile } from './portable-backup-file'

const backup: PortableBackupV1 = {
  format: 'receitas-portable-backup',
  version: 1,
  scope: 'active-shared-data',
  exportedAt: '2026-08-07T22:03:04.000Z',
  sourcePairId: 'pair-a',
  categories: [],
  conversionProfiles: [],
  recipes: [],
}

describe('createPortableBackupFile', () => {
  it('creates a deterministic JSON filename and validated archive blob', async () => {
    const file = createPortableBackupFile(backup)

    expect(file.filename).toBe('receitas-backup-2026-08-07T220304Z.json')
    expect(file.blob.type).toBe('application/json')
    expect(file.blob.size).toBeGreaterThan(0)
    expect(JSON.parse(await file.blob.text())).toEqual(backup)
  })
})
