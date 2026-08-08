export const PORTABLE_BACKUP_MAX_BYTES = 32 * 1024 * 1024

function assertSize(value: number, label: string): void {
  if (!Number.isFinite(value) || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} size must be a non-negative integer`)
  }
}

export function assertPortableBackupFileSize(sizeBytes: number): void {
  assertSize(sizeBytes, 'Backup file')
  if (sizeBytes > PORTABLE_BACKUP_MAX_BYTES) {
    throw new Error('Backup file is larger than the 32 MiB import limit')
  }
}

export function assertPortableBackupTextLength(characters: number): void {
  assertSize(characters, 'Backup text')
  if (characters > PORTABLE_BACKUP_MAX_BYTES) {
    throw new Error('Backup text is too large to parse safely')
  }
}
