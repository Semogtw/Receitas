import {
  COMPLETE_BACKUP_DATA_PATHS,
  assertBackupValueHasNoSecrets,
  createBackupManifest,
  type BackupFileDescriptor,
  type BackupManifest,
  type BackupMediaFileDescriptor,
} from './complete-backup-format'
import {
  assertCompleteBackupEntryCount,
  assertCompleteBackupEntrySize,
  assertCompleteBackupUncompressedTotal,
} from './complete-backup-limits'

export interface ArchiveEntryMetadata {
  filename: string
  compressedSize: number
  uncompressedSize: number
  directory: boolean
  encrypted?: boolean
  externalFileAttributes?: number
}

export interface ValidatedStructuredBackup {
  sourcePairId: string
  data: Map<string, unknown>
}

const MEDIA_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
}

function objectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as Record<string, unknown>
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be non-empty text`)
  return value
}

function requiredInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`)
  return value
}

function parseDescriptor(value: unknown, media: false): BackupFileDescriptor
function parseDescriptor(value: unknown, media: true): BackupMediaFileDescriptor
function parseDescriptor(value: unknown, media: boolean): BackupFileDescriptor | BackupMediaFileDescriptor {
  const row = objectRecord(value, media ? 'Backup media descriptor' : 'Backup data descriptor')
  const descriptor: BackupFileDescriptor = {
    path: requiredString(row.path, 'Backup descriptor path'),
    sha256: requiredString(row.sha256, 'Backup descriptor SHA-256'),
    bytes: requiredInteger(row.bytes, 'Backup descriptor bytes'),
  }
  if (!media) return descriptor
  return { ...descriptor, mediaType: requiredString(row.mediaType, 'Backup media type') }
}

export function parseCompleteBackupManifest(serialized: string): BackupManifest {
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    throw new Error('Backup manifest is not valid JSON')
  }
  const root = objectRecord(value, 'Backup manifest')
  const allowed = new Set(['format', 'version', 'createdAt', 'appVersion', 'pairExportId', 'dataFiles', 'mediaFiles'])
  for (const key of Object.keys(root)) {
    if (!allowed.has(key)) throw new Error(`Backup manifest contains unsupported field: ${key}`)
  }
  if (root.format !== 'receitas-backup') throw new Error('Unsupported complete backup format')
  if (root.version !== 1) throw new Error('Unsupported complete backup version')
  if (!Array.isArray(root.dataFiles) || !Array.isArray(root.mediaFiles)) throw new Error('Backup manifest file lists must be arrays')

  const manifest = createBackupManifest({
    createdAt: requiredString(root.createdAt, 'Backup manifest createdAt'),
    appVersion: requiredString(root.appVersion, 'Backup manifest appVersion'),
    pairExportId: requiredString(root.pairExportId, 'Backup manifest pairExportId'),
    dataFiles: root.dataFiles.map((entry) => parseDescriptor(entry, false)),
    mediaFiles: root.mediaFiles.map((entry) => parseDescriptor(entry, true)),
  })
  assertBackupValueHasNoSecrets(manifest)
  return manifest
}

function assertSafeArchivePath(path: string): void {
  if (!path || path.includes('\0') || path.includes('\\') || path.startsWith('/') || /^[a-zA-Z]:/.test(path)) {
    throw new Error(`Unsafe backup archive path: ${path}`)
  }
  const parts = path.split('/')
  if (parts.some((part) => !part || part === '.' || part === '..')) throw new Error(`Unsafe backup archive path: ${path}`)
  if (path !== 'manifest.json' && !path.startsWith('data/') && !path.startsWith('media/')) {
    throw new Error(`Unexpected backup archive path: ${path}`)
  }
}

function isUnixSymlink(attributes: number | undefined): boolean {
  if (attributes === undefined) return false
  const mode = (attributes >>> 16) & 0xffff
  return (mode & 0o170000) === 0o120000
}

export function validateArchiveEntryMetadata(entries: readonly ArchiveEntryMetadata[]): void {
  assertCompleteBackupEntryCount(entries.length)
  const names = new Set<string>()
  let uncompressedTotal = 0

  for (const entry of entries) {
    assertSafeArchivePath(entry.filename)
    if (entry.directory) throw new Error(`Directory entries are not allowed in complete backups: ${entry.filename}`)
    if (entry.encrypted) throw new Error(`Encrypted backup entries are not supported: ${entry.filename}`)
    if (isUnixSymlink(entry.externalFileAttributes)) throw new Error(`Symlink-like backup entry is not allowed: ${entry.filename}`)
    if (names.has(entry.filename)) throw new Error(`Duplicate backup archive entry: ${entry.filename}`)
    names.add(entry.filename)
    assertCompleteBackupEntrySize({
      path: entry.filename,
      compressedSize: entry.compressedSize,
      uncompressedSize: entry.uncompressedSize,
    })
    uncompressedTotal += entry.uncompressedSize
  }

  assertCompleteBackupUncompressedTotal(uncompressedTotal)
  if (!names.has('manifest.json')) throw new Error('Complete backup is missing manifest.json')
}

export function validateArchiveAgainstManifest(
  entries: readonly ArchiveEntryMetadata[],
  manifest: BackupManifest,
): void {
  const byName = new Map(entries.map((entry) => [entry.filename, entry]))
  const declared = [...manifest.dataFiles, ...manifest.mediaFiles]
  const expectedPaths = new Set(['manifest.json', ...declared.map((entry) => entry.path)])

  for (const entry of entries) {
    if (!expectedPaths.has(entry.filename)) throw new Error(`Backup archive contains undeclared entry: ${entry.filename}`)
  }
  for (const descriptor of declared) {
    const entry = byName.get(descriptor.path)
    if (!entry) throw new Error(`Backup archive is missing declared entry: ${descriptor.path}`)
    if (entry.uncompressedSize !== descriptor.bytes) throw new Error(`Backup entry byte count differs from manifest: ${descriptor.path}`)
  }

  for (const descriptor of manifest.mediaFiles) {
    const extension = MEDIA_EXTENSION[descriptor.mediaType]
    if (!extension || !descriptor.path.endsWith(extension)) {
      throw new Error(`Backup media extension does not match its declared type: ${descriptor.path}`)
    }
  }
}

export function parseCompleteBackupDataJson(path: string, serialized: string): unknown {
  if (!(COMPLETE_BACKUP_DATA_PATHS as readonly string[]).includes(path)) throw new Error(`Unsupported backup data path: ${path}`)
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    throw new Error(`Backup data entry is not valid JSON: ${path}`)
  }
  assertBackupValueHasNoSecrets(value, path)
  return value
}

function rows(data: Map<string, unknown>, path: string): Record<string, unknown>[] {
  const value = data.get(path)
  if (!Array.isArray(value)) throw new Error(`Backup data entry must contain an array: ${path}`)
  return value.map((row, index) => objectRecord(row, `${path}[${index}]`))
}

function rowId(row: Record<string, unknown>, path: string): string {
  return requiredString(row.id, `${path} row id`)
}

function rowIds(rowsValue: readonly Record<string, unknown>[], path: string): Set<string> {
  const ids = new Set<string>()
  for (const row of rowsValue) {
    const id = rowId(row, path)
    if (ids.has(id)) throw new Error(`Backup contains duplicate id ${id} in ${path}`)
    ids.add(id)
  }
  return ids
}

function requireReference(value: unknown, ids: ReadonlySet<string>, label: string): void {
  const id = requiredString(value, label)
  if (!ids.has(id)) throw new Error(`${label} references unknown id ${id}`)
}

function assertPairScope(rowsValue: readonly Record<string, unknown>[], sourcePairId: string, path: string): void {
  for (const row of rowsValue) {
    if (row.pair_id !== sourcePairId) throw new Error(`Backup row in ${path} escapes the source pair scope`)
  }
}

export function validateStructuredBackupData(data: Map<string, unknown>): ValidatedStructuredBackup {
  for (const path of COMPLETE_BACKUP_DATA_PATHS) {
    if (!data.has(path)) throw new Error(`Backup data is missing ${path}`)
  }

  const pair = objectRecord(data.get('data/pair.json'), 'Backup pair metadata')
  const sourcePairId = requiredString(pair.sourcePairId, 'Backup sourcePairId')

  const recipes = rows(data, 'data/recipes.json')
  const ingredients = rows(data, 'data/recipe-ingredients.json')
  const steps = rows(data, 'data/recipe-steps.json')
  const categories = rows(data, 'data/categories.json')
  const recipeCategories = rows(data, 'data/recipe-categories.json')
  const sessions = rows(data, 'data/cooking-sessions.json')
  const ratings = rows(data, 'data/cooking-session-ratings.json')
  const periods = rows(data, 'data/meal-periods.json')
  const mealEntries = rows(data, 'data/meal-plan-entries.json')
  const lists = rows(data, 'data/shopping-lists.json')
  const shoppingItems = rows(data, 'data/shopping-items.json')
  const conversions = rows(data, 'data/conversion-profiles.json')
  const photos = rows(data, 'data/photo-metadata.json')

  const groups = [
    ['data/recipes.json', recipes],
    ['data/recipe-ingredients.json', ingredients],
    ['data/recipe-steps.json', steps],
    ['data/categories.json', categories],
    ['data/recipe-categories.json', recipeCategories],
    ['data/cooking-sessions.json', sessions],
    ['data/cooking-session-ratings.json', ratings],
    ['data/meal-periods.json', periods],
    ['data/meal-plan-entries.json', mealEntries],
    ['data/shopping-lists.json', lists],
    ['data/shopping-items.json', shoppingItems],
    ['data/conversion-profiles.json', conversions],
    ['data/photo-metadata.json', photos],
  ] as const

  for (const [path, group] of groups) {
    assertPairScope(group, sourcePairId, path)
    rowIds(group, path)
  }

  const recipeIds = rowIds(recipes, 'data/recipes.json')
  const categoryIds = rowIds(categories, 'data/categories.json')
  const sessionIds = rowIds(sessions, 'data/cooking-sessions.json')
  const periodIds = rowIds(periods, 'data/meal-periods.json')
  const listIds = rowIds(lists, 'data/shopping-lists.json')

  ingredients.forEach((row) => requireReference(row.recipe_id, recipeIds, 'Recipe ingredient recipe_id'))
  steps.forEach((row) => requireReference(row.recipe_id, recipeIds, 'Recipe step recipe_id'))
  recipeCategories.forEach((row) => {
    requireReference(row.recipe_id, recipeIds, 'Recipe category recipe_id')
    requireReference(row.category_id, categoryIds, 'Recipe category category_id')
  })
  sessions.forEach((row) => requireReference(row.recipe_id, recipeIds, 'Cooking session recipe_id'))
  ratings.forEach((row) => requireReference(row.cooking_session_id, sessionIds, 'Cooking rating cooking_session_id'))
  mealEntries.forEach((row) => {
    requireReference(row.recipe_id, recipeIds, 'Meal plan recipe_id')
    if (row.meal_period_id !== null && row.meal_period_id !== undefined) {
      requireReference(row.meal_period_id, periodIds, 'Meal plan meal_period_id')
    }
  })
  shoppingItems.forEach((row) => requireReference(row.shopping_list_id, listIds, 'Shopping item shopping_list_id'))
  photos.forEach((row) => {
    if (row.ownerType === 'recipe') {
      requireReference(row.recipe_id, recipeIds, 'Recipe photo recipe_id')
    } else if (row.ownerType === 'cooking_session') {
      requireReference(row.cooking_session_id, sessionIds, 'Cooking photo cooking_session_id')
    } else {
      throw new Error('Backup photo metadata has an unsupported ownerType')
    }
  })

  return { sourcePairId, data }
}
