import { serializePortableBackup, type PortableBackupV1 } from '../domain/portable-backup'

export interface PortableBackupFile {
  filename: string
  blob: Blob
}

function compactTimestamp(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw new Error('Backup exportedAt must be a normalized ISO timestamp')
  }
  return value
    .replace(/[-:]/g, '')
    .replace('.000', '')
}

export function createPortableBackupFile(backup: PortableBackupV1): PortableBackupFile {
  const serialized = serializePortableBackup(backup)
  return {
    filename: `receitas-backup-${compactTimestamp(backup.exportedAt)}.json`,
    blob: new Blob([serialized], { type: 'application/json' }),
  }
}
