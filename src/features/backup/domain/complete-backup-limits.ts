export const COMPLETE_BACKUP_MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024
export const COMPLETE_BACKUP_MAX_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024
export const COMPLETE_BACKUP_MAX_ENTRY_COUNT = 10_000
export const COMPLETE_BACKUP_MAX_JSON_ENTRY_BYTES = 64 * 1024 * 1024
export const COMPLETE_BACKUP_MAX_MANIFEST_BYTES = 2 * 1024 * 1024
export const COMPLETE_BACKUP_MAX_MEDIA_ENTRY_BYTES = 25 * 1024 * 1024
export const COMPLETE_BACKUP_MAX_COMPRESSION_RATIO = 200

function safeSize(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer`)
  return value
}

export function assertCompleteBackupArchiveSize(bytes: number): void {
  safeSize(bytes, 'Backup archive size')
  if (bytes > COMPLETE_BACKUP_MAX_ARCHIVE_BYTES) throw new Error('Backup archive exceeds the supported size limit')
}

export function assertCompleteBackupEntryCount(count: number): void {
  safeSize(count, 'Backup entry count')
  if (count > COMPLETE_BACKUP_MAX_ENTRY_COUNT) throw new Error('Backup archive contains too many entries')
}

export function assertCompleteBackupEntrySize(input: {
  path: string
  compressedSize: number
  uncompressedSize: number
}): void {
  const compressed = safeSize(input.compressedSize, `Compressed size for ${input.path}`)
  const uncompressed = safeSize(input.uncompressedSize, `Uncompressed size for ${input.path}`)
  const limit = input.path === 'manifest.json'
    ? COMPLETE_BACKUP_MAX_MANIFEST_BYTES
    : input.path.startsWith('data/')
      ? COMPLETE_BACKUP_MAX_JSON_ENTRY_BYTES
      : COMPLETE_BACKUP_MAX_MEDIA_ENTRY_BYTES

  if (uncompressed > limit) throw new Error(`Backup entry ${input.path} exceeds its size limit`)
  if (uncompressed > 0 && compressed === 0) throw new Error(`Backup entry ${input.path} has an unsafe compression ratio`)
  if (compressed > 0 && uncompressed / compressed > COMPLETE_BACKUP_MAX_COMPRESSION_RATIO) {
    throw new Error(`Backup entry ${input.path} has an unsafe compression ratio`)
  }
}

export function assertCompleteBackupUncompressedTotal(bytes: number): void {
  safeSize(bytes, 'Backup uncompressed size')
  if (bytes > COMPLETE_BACKUP_MAX_UNCOMPRESSED_BYTES) {
    throw new Error('Backup archive expands beyond the supported size limit')
  }
}
