import { describe, expect, it } from 'vitest'
import {
  PORTABLE_BACKUP_MAX_BYTES,
  assertPortableBackupFileSize,
  assertPortableBackupTextLength,
} from './portable-backup-limits'

describe('portable backup input limits', () => {
  it('accepts files up to 32 MiB and rejects larger inputs before reading them', () => {
    expect(PORTABLE_BACKUP_MAX_BYTES).toBe(32 * 1024 * 1024)
    expect(() => assertPortableBackupFileSize(PORTABLE_BACKUP_MAX_BYTES)).not.toThrow()
    expect(() => assertPortableBackupFileSize(PORTABLE_BACKUP_MAX_BYTES + 1)).toThrow('32 MiB')
  })

  it('rejects nonsensical file sizes', () => {
    expect(() => assertPortableBackupFileSize(-1)).toThrow('size')
    expect(() => assertPortableBackupFileSize(Number.NaN)).toThrow('size')
  })

  it('caps parsed text before JSON.parse can allocate nested archive objects', () => {
    expect(() => assertPortableBackupTextLength(PORTABLE_BACKUP_MAX_BYTES)).not.toThrow()
    expect(() => assertPortableBackupTextLength(PORTABLE_BACKUP_MAX_BYTES + 1)).toThrow('large')
  })
})
