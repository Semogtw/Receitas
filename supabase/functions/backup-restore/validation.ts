const REQUIRED_DATA_PATHS = [
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

const REQUIRED_DATA_PATH_SET = new Set<string>(REQUIRED_DATA_PATHS)
const ALLOWED_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
const MEDIA_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
}
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

export const RESTORE_DATA_BATCH_MAX_BYTES = 1024 * 1024
export const RESTORE_MANIFEST_MAX_FILES = 10_000
export const RESTORE_DATA_FILE_MAX_BYTES = 64 * 1024 * 1024
export const RESTORE_MEDIA_FILE_MAX_BYTES = 25 * 1024 * 1024

export interface RestoreFileDescriptor {
  path: string
  sha256: string
  bytes: number
}

export interface RestoreMediaDescriptor extends RestoreFileDescriptor {
  mediaType: string
}

export interface RestoreManifest {
  format: 'receitas-backup'
  version: 1
  createdAt: string
  appVersion: string
  pairExportId: string
  dataFiles: RestoreFileDescriptor[]
  mediaFiles: RestoreMediaDescriptor[]
}

export interface RestoreDataBatch {
  path: string
  batchIndex: number
  fileSha256: string
  fileByteSize: number
  payload: unknown
  payloadByteSize: number
}

export interface RestoreMediaStage {
  path: string
  sha256: string
  byteSize: number
  mediaType: string
  storagePath: string
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}_must_be_object`)
  return value as Record<string, unknown>
}

function text(value: unknown, label: string, maxLength = 4096): string {
  if (typeof value !== 'string') throw new Error(`${label}_must_be_text`)
  const normalized = value.trim()
  if (!normalized || normalized.length > maxLength) throw new Error(`${label}_invalid`)
  return normalized
}

function integer(value: unknown, label: string, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new Error(`${label}_invalid`)
  }
  return value
}

function sha(value: unknown, label: string): string {
  const result = text(value, label, 64).toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(result)) throw new Error(`${label}_invalid`)
  return result
}

function safePath(value: unknown, prefix: 'data/' | 'media/'): string {
  const path = text(value, 'path', 512)
  if (!path.startsWith(prefix) || path.startsWith('/') || path.includes('\\') || path.includes('\0')) {
    throw new Error('unsafe_restore_path')
  }
  if (path.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('unsafe_restore_path')
  return path
}

function assertNoSecrets(value: unknown, path = 'restore'): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertNoSecrets(child, `${path}[${index}]`))
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_FIELD_NAMES.has(key.toLocaleLowerCase('en-US'))) throw new Error(`forbidden_restore_field:${path}.${key}`)
    assertNoSecrets(child, `${path}.${key}`)
  }
}

function parseDescriptor(value: unknown, media: false): RestoreFileDescriptor
function parseDescriptor(value: unknown, media: true): RestoreMediaDescriptor
function parseDescriptor(value: unknown, media: boolean): RestoreFileDescriptor | RestoreMediaDescriptor {
  const input = record(value, media ? 'media_descriptor' : 'data_descriptor')
  const path = safePath(input.path, media ? 'media/' : 'data/')
  const bytes = integer(input.bytes, 'descriptor_bytes', media ? RESTORE_MEDIA_FILE_MAX_BYTES : RESTORE_DATA_FILE_MAX_BYTES)
  const descriptor: RestoreFileDescriptor = { path, sha256: sha(input.sha256, 'descriptor_sha256'), bytes }
  if (!media) return descriptor
  const mediaType = text(input.mediaType, 'media_type', 100).toLowerCase()
  if (!ALLOWED_MEDIA_TYPES.has(mediaType)) throw new Error('media_type_not_allowed')
  if (!path.endsWith(MEDIA_EXTENSION[mediaType]!)) throw new Error('media_extension_mismatch')
  return { ...descriptor, mediaType }
}

export function parseRestoreManifest(value: unknown): RestoreManifest {
  const root = record(value, 'manifest')
  const allowed = new Set(['format', 'version', 'createdAt', 'appVersion', 'pairExportId', 'dataFiles', 'mediaFiles'])
  for (const key of Object.keys(root)) if (!allowed.has(key)) throw new Error(`manifest_field_not_allowed:${key}`)
  if (root.format !== 'receitas-backup' || root.version !== 1) throw new Error('unsupported_restore_format')
  if (!Array.isArray(root.dataFiles) || !Array.isArray(root.mediaFiles)) throw new Error('manifest_file_lists_invalid')
  if (root.dataFiles.length + root.mediaFiles.length > RESTORE_MANIFEST_MAX_FILES) throw new Error('manifest_too_many_files')

  const dataFiles = root.dataFiles.map((entry) => parseDescriptor(entry, false))
  const mediaFiles = root.mediaFiles.map((entry) => parseDescriptor(entry, true))
  const paths = new Set<string>()
  for (const descriptor of [...dataFiles, ...mediaFiles]) {
    if (paths.has(descriptor.path)) throw new Error('manifest_duplicate_path')
    paths.add(descriptor.path)
  }
  for (const path of REQUIRED_DATA_PATHS) if (!paths.has(path)) throw new Error(`manifest_missing_data:${path}`)
  if (dataFiles.some((entry) => !REQUIRED_DATA_PATH_SET.has(entry.path))) throw new Error('manifest_unknown_data_file')

  const createdAt = text(root.createdAt, 'manifest_created_at', 64)
  const createdMillis = Date.parse(createdAt)
  if (!Number.isFinite(createdMillis) || new Date(createdMillis).toISOString() !== createdAt) throw new Error('manifest_created_at_invalid')

  const manifest: RestoreManifest = {
    format: 'receitas-backup',
    version: 1,
    createdAt,
    appVersion: text(root.appVersion, 'manifest_app_version', 100),
    pairExportId: text(root.pairExportId, 'manifest_pair_export_id', 200),
    dataFiles: [...dataFiles].sort((a, b) => a.path.localeCompare(b.path)),
    mediaFiles: [...mediaFiles].sort((a, b) => a.path.localeCompare(b.path)),
  }
  assertNoSecrets(manifest)
  return manifest
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

export function canonicalJsonBytes(value: unknown): Uint8Array {
  assertNoSecrets(value)
  return new TextEncoder().encode(`${JSON.stringify(stableValue(value), null, 2)}\n`)
}

export async function sha256Hex(bytes: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function manifestSha256(manifest: RestoreManifest): Promise<string> {
  return sha256Hex(canonicalJsonBytes(manifest))
}

export function descriptorForPath(manifest: RestoreManifest, path: string): RestoreFileDescriptor | RestoreMediaDescriptor | null {
  return [...manifest.dataFiles, ...manifest.mediaFiles].find((entry) => entry.path === path) ?? null
}

export function validateDataBatchInput(input: {
  manifest: RestoreManifest
  path: unknown
  batchIndex: unknown
  fileSha256: unknown
  fileByteSize: unknown
  payload: unknown
}): RestoreDataBatch {
  const path = safePath(input.path, 'data/')
  if (!REQUIRED_DATA_PATH_SET.has(path)) throw new Error('restore_data_path_not_allowed')
  const descriptor = input.manifest.dataFiles.find((entry) => entry.path === path)
  if (!descriptor) throw new Error('restore_data_not_declared')
  const batchIndex = integer(input.batchIndex, 'batch_index', 100_000)
  const fileSha256 = sha(input.fileSha256, 'file_sha256')
  const fileByteSize = integer(input.fileByteSize, 'file_byte_size', RESTORE_DATA_FILE_MAX_BYTES)
  if (fileSha256 !== descriptor.sha256 || fileByteSize !== descriptor.bytes) throw new Error('restore_data_descriptor_mismatch')

  const bytes = canonicalJsonBytes(input.payload)
  if (bytes.byteLength === 0 || bytes.byteLength > RESTORE_DATA_BATCH_MAX_BYTES) throw new Error('restore_data_batch_too_large')
  if (path === 'data/pair.json') {
    if (batchIndex !== 0 || !input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) {
      throw new Error('restore_pair_batch_invalid')
    }
  } else if (!Array.isArray(input.payload)) {
    throw new Error('restore_table_batch_must_be_array')
  }

  return { path, batchIndex, fileSha256, fileByteSize, payload: input.payload, payloadByteSize: bytes.byteLength }
}

function rowObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}_row_invalid`)
  return value as Record<string, unknown>
}

function requiredRowId(row: Record<string, unknown>, label: string): string {
  return text(row.id, `${label}_id`, 200)
}

function rows(data: Map<string, unknown>, path: string): Record<string, unknown>[] {
  const value = data.get(path)
  if (!Array.isArray(value)) throw new Error(`restore_file_not_array:${path}`)
  return value.map((row, index) => rowObject(row, `${path}:${index}`))
}

function idsFor(rowsValue: readonly Record<string, unknown>[], label: string): Set<string> {
  const ids = new Set<string>()
  for (const row of rowsValue) {
    const id = requiredRowId(row, label)
    if (ids.has(id)) throw new Error(`restore_duplicate_id:${label}:${id}`)
    ids.add(id)
  }
  return ids
}

function requireReference(value: unknown, ids: ReadonlySet<string>, label: string): void {
  const id = text(value, label, 200)
  if (!ids.has(id)) throw new Error(`restore_reference_missing:${label}:${id}`)
}

function assertPairRows(rowsValue: readonly Record<string, unknown>[], sourcePairId: string, label: string): void {
  for (const row of rowsValue) if (row.pair_id !== sourcePairId) throw new Error(`restore_pair_scope_mismatch:${label}`)
}

export function validateRestoredGraph(data: Map<string, unknown>): string {
  for (const path of REQUIRED_DATA_PATHS) if (!data.has(path)) throw new Error(`restore_file_missing:${path}`)
  const pair = record(data.get('data/pair.json'), 'pair_file')
  const sourcePairId = text(pair.sourcePairId, 'source_pair_id', 200)

  const recipes = rows(data, 'data/recipes.json')
  const ingredients = rows(data, 'data/recipe-ingredients.json')
  const steps = rows(data, 'data/recipe-steps.json')
  const categories = rows(data, 'data/categories.json')
  const joins = rows(data, 'data/recipe-categories.json')
  const sessions = rows(data, 'data/cooking-sessions.json')
  const ratings = rows(data, 'data/cooking-session-ratings.json')
  const periods = rows(data, 'data/meal-periods.json')
  const mealEntries = rows(data, 'data/meal-plan-entries.json')
  const lists = rows(data, 'data/shopping-lists.json')
  const shoppingItems = rows(data, 'data/shopping-items.json')
  const conversions = rows(data, 'data/conversion-profiles.json')
  const photos = rows(data, 'data/photo-metadata.json')

  for (const [label, group] of [
    ['recipes', recipes], ['ingredients', ingredients], ['steps', steps], ['categories', categories],
    ['recipe_categories', joins], ['cooking_sessions', sessions], ['ratings', ratings], ['periods', periods],
    ['meal_entries', mealEntries], ['shopping_lists', lists], ['shopping_items', shoppingItems],
    ['conversions', conversions], ['photos', photos],
  ] as const) {
    assertPairRows(group, sourcePairId, label)
    idsFor(group, label)
    group.forEach((row) => assertNoSecrets(row, label))
  }

  const recipeIds = idsFor(recipes, 'recipes')
  const categoryIds = idsFor(categories, 'categories')
  const sessionIds = idsFor(sessions, 'cooking_sessions')
  const periodIds = idsFor(periods, 'periods')
  const listIds = idsFor(lists, 'shopping_lists')

  ingredients.forEach((row) => requireReference(row.recipe_id, recipeIds, 'ingredient_recipe'))
  steps.forEach((row) => requireReference(row.recipe_id, recipeIds, 'step_recipe'))
  joins.forEach((row) => {
    requireReference(row.recipe_id, recipeIds, 'category_recipe')
    requireReference(row.category_id, categoryIds, 'category_id')
  })
  sessions.forEach((row) => requireReference(row.recipe_id, recipeIds, 'session_recipe'))
  ratings.forEach((row) => requireReference(row.cooking_session_id, sessionIds, 'rating_session'))
  mealEntries.forEach((row) => {
    requireReference(row.recipe_id, recipeIds, 'meal_recipe')
    if (row.meal_period_id !== null && row.meal_period_id !== undefined) {
      requireReference(row.meal_period_id, periodIds, 'meal_period')
    }
  })
  shoppingItems.forEach((row) => requireReference(row.shopping_list_id, listIds, 'shopping_list'))
  photos.forEach((row) => {
    if (row.ownerType === 'recipe') requireReference(row.recipe_id, recipeIds, 'photo_recipe')
    else if (row.ownerType === 'cooking_session') requireReference(row.cooking_session_id, sessionIds, 'photo_session')
    else throw new Error('restore_photo_owner_invalid')
  })

  return sourcePairId
}

export async function rebuildAndValidateDataFiles(
  manifest: RestoreManifest,
  staged: readonly RestoreDataBatch[],
): Promise<{ sourcePairId: string; data: Map<string, unknown> }> {
  const byPath = new Map<string, RestoreDataBatch[]>()
  for (const batch of staged) {
    const list = byPath.get(batch.path) ?? []
    list.push(batch)
    byPath.set(batch.path, list)
  }

  const data = new Map<string, unknown>()
  for (const descriptor of manifest.dataFiles) {
    const batches = [...(byPath.get(descriptor.path) ?? [])].sort((a, b) => a.batchIndex - b.batchIndex)
    if (batches.length === 0) throw new Error(`restore_staged_file_missing:${descriptor.path}`)
    for (const [expectedIndex, batch] of batches.entries()) {
      if (batch.batchIndex !== expectedIndex) throw new Error(`restore_batch_gap:${descriptor.path}`)
      if (batch.fileSha256 !== descriptor.sha256 || batch.fileByteSize !== descriptor.bytes) {
        throw new Error(`restore_batch_descriptor_mismatch:${descriptor.path}`)
      }
    }

    let value: unknown
    if (descriptor.path === 'data/pair.json') {
      if (batches.length !== 1) throw new Error('restore_pair_file_multiple_batches')
      value = batches[0]!.payload
    } else {
      value = batches.flatMap((batch) => {
        if (!Array.isArray(batch.payload)) throw new Error(`restore_batch_not_array:${descriptor.path}`)
        return batch.payload
      })
    }

    const bytes = canonicalJsonBytes(value)
    if (bytes.byteLength !== descriptor.bytes) throw new Error(`restore_file_size_mismatch:${descriptor.path}`)
    if (await sha256Hex(bytes) !== descriptor.sha256) throw new Error(`restore_file_checksum_mismatch:${descriptor.path}`)
    data.set(descriptor.path, value)
  }

  return { sourcePairId: validateRestoredGraph(data), data }
}

export function validateStagedMedia(manifest: RestoreManifest, staged: readonly RestoreMediaStage[]): void {
  const byPath = new Map<string, RestoreMediaStage>()
  for (const item of staged) {
    if (byPath.has(item.path)) throw new Error(`restore_staged_media_duplicate:${item.path}`)
    byPath.set(item.path, item)
  }
  if (byPath.size !== manifest.mediaFiles.length) throw new Error('restore_staged_media_count_mismatch')

  for (const descriptor of manifest.mediaFiles) {
    const item = byPath.get(descriptor.path)
    if (!item) throw new Error(`restore_staged_media_missing:${descriptor.path}`)
    if (item.sha256 !== descriptor.sha256 || item.byteSize !== descriptor.bytes || item.mediaType !== descriptor.mediaType) {
      throw new Error(`restore_staged_media_descriptor_mismatch:${descriptor.path}`)
    }
    if (!item.storagePath.includes('/')) throw new Error(`restore_staged_media_storage_path_invalid:${descriptor.path}`)
  }
}
