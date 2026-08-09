export interface BackupFileDescriptor {
  path: string
  sha256: string
  bytes: number
}

export interface BackupMediaFileDescriptor extends BackupFileDescriptor {
  mediaType: string
}

export interface BackupManifest {
  format: 'receitas-backup'
  version: 1
  createdAt: string
  appVersion: string
  pairExportId: string
  dataFiles: BackupFileDescriptor[]
  mediaFiles: BackupMediaFileDescriptor[]
}

export interface BackupArtifact {
  manifest: BackupManifest
  filename: string
  bytes: number
  sha256: string
  file: File
}

export const COMPLETE_BACKUP_DATA_PATHS = [
  'data/pair.json',
  'data/recipes.json',
  'data/recipe-ingredients.json',
  'data/recipe-steps.json',
  'data/categories.json',
  'data/recipe-categories.json',
  'data/cooking-sessions.json',
  'data/cooking-session-ratings.json',
  'data/meal-periods.json',
  'data/meal-plan-entries.json',
  'data/shopping-lists.json',
  'data/shopping-items.json',
  'data/conversion-profiles.json',
  'data/photo-metadata.json',
] as const

const FORBIDDEN_FIELD_NAMES = new Set([
  'password',
  'access_token',
  'refresh_token',
  'authorization',
  'session',
  'bootstrap_secret',
  'service_role_key',
  'supabase_service_role_key',
  'supabase_secret_key',
  'provider_token',
  'provider_refresh_token',
])

function normalizedIsoTimestamp(value: string): string {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error('Backup createdAt must be a normalized ISO timestamp')
  }
  return value
}

function assertDescriptor(descriptor: BackupFileDescriptor, prefix: 'data/' | 'media/'): void {
  if (!descriptor.path.startsWith(prefix) || descriptor.path.includes('..') || descriptor.path.startsWith('/')) {
    throw new Error(`Invalid backup entry path: ${descriptor.path}`)
  }
  if (!/^[0-9a-f]{64}$/.test(descriptor.sha256)) {
    throw new Error(`Invalid SHA-256 for ${descriptor.path}`)
  }
  if (!Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 0) {
    throw new Error(`Invalid byte count for ${descriptor.path}`)
  }
}

function sortedDescriptors<T extends BackupFileDescriptor>(descriptors: readonly T[]): T[] {
  return [...descriptors].sort((left, right) => left.path.localeCompare(right.path))
}

export function createBackupManifest(input: {
  createdAt: string
  appVersion: string
  pairExportId: string
  dataFiles: readonly BackupFileDescriptor[]
  mediaFiles: readonly BackupMediaFileDescriptor[]
}): BackupManifest {
  normalizedIsoTimestamp(input.createdAt)
  if (!input.appVersion.trim()) throw new Error('Backup appVersion is required')
  if (!input.pairExportId.trim()) throw new Error('Backup pairExportId is required')

  const dataFiles = sortedDescriptors(input.dataFiles)
  const mediaFiles = sortedDescriptors(input.mediaFiles)
  const paths = new Set<string>()

  for (const descriptor of dataFiles) {
    assertDescriptor(descriptor, 'data/')
    if (paths.has(descriptor.path)) throw new Error(`Duplicate backup entry path: ${descriptor.path}`)
    paths.add(descriptor.path)
  }
  for (const descriptor of mediaFiles) {
    assertDescriptor(descriptor, 'media/')
    if (!descriptor.mediaType.startsWith('image/')) throw new Error(`Unsupported backup media type: ${descriptor.mediaType}`)
    if (paths.has(descriptor.path)) throw new Error(`Duplicate backup entry path: ${descriptor.path}`)
    paths.add(descriptor.path)
  }

  const missing = COMPLETE_BACKUP_DATA_PATHS.filter((path) => !paths.has(path))
  if (missing.length > 0) throw new Error(`Backup is missing required data entries: ${missing.join(', ')}`)

  return {
    format: 'receitas-backup',
    version: 1,
    createdAt: input.createdAt,
    appVersion: input.appVersion.trim(),
    pairExportId: input.pairExportId.trim(),
    dataFiles,
    mediaFiles,
  }
}

export function assertBackupValueHasNoSecrets(value: unknown, path = 'backup'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertBackupValueHasNoSecrets(item, `${path}[${index}]`))
    return
  }
  if (!value || typeof value !== 'object') return

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_FIELD_NAMES.has(key.toLocaleLowerCase('en-US'))) {
      throw new Error(`Backup contains forbidden field at ${path}.${key}`)
    }
    assertBackupValueHasNoSecrets(child, `${path}.${key}`)
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]),
  )
}

export function encodeBackupJson(value: unknown): Uint8Array {
  assertBackupValueHasNoSecrets(value)
  const serialized = `${JSON.stringify(stableValue(value), null, 2)}\n`
  return new TextEncoder().encode(serialized)
}

export async function sha256Hex(data: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function backupFilename(createdAt: string): string {
  normalizedIsoTimestamp(createdAt)
  return `receitas-backup-${createdAt.replace(/[:.]/g, '-')}.zip`
}
