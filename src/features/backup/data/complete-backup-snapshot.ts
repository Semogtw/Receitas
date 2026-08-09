import type { PowerSyncDatabase } from '@powersync/web'
import { MediaUploadQueueStore } from '../../media/data/media-upload-queue'
import { COMPLETE_BACKUP_DATA_PATHS, encodeBackupJson } from '../domain/complete-backup-format'

export class BackupRequiresSyncError extends Error {
  readonly code = 'backup_requires_sync'

  constructor(message = 'Backup completo requer todas as alterações e mídias sincronizadas.') {
    super(message)
    this.name = 'BackupRequiresSyncError'
  }
}

export interface CompleteBackupPhotoRow extends Record<string, unknown> {
  id: string
  pair_id: string
  storage_path: string
  storage_state: string
  mime_type: string
  sha256: string | null
  deleted_at: string | null
}

export interface CompleteBackupSnapshot {
  createdAt: string
  pairId: string
  dataEntries: Array<{ path: (typeof COMPLETE_BACKUP_DATA_PATHS)[number]; bytes: Uint8Array }>
  photos: Array<CompleteBackupPhotoRow & { ownerType: 'recipe' | 'cooking_session' }>
}

interface QueryContext {
  getAll<T>(sql: string, params?: unknown[]): Promise<T[]>
  getOptional<T>(sql: string, params?: unknown[]): Promise<T | null>
}

const DATA_TABLES = [
  ['data/recipes.json', 'recipes'],
  ['data/recipe-ingredients.json', 'recipe_ingredients'],
  ['data/recipe-steps.json', 'recipe_steps'],
  ['data/categories.json', 'categories'],
  ['data/recipe-categories.json', 'recipe_categories'],
  ['data/cooking-sessions.json', 'cooking_sessions'],
  ['data/cooking-session-ratings.json', 'cooking_session_ratings'],
  ['data/meal-periods.json', 'meal_periods'],
  ['data/meal-plan-entries.json', 'meal_plan_entries'],
  ['data/shopping-lists.json', 'shopping_lists'],
  ['data/shopping-items.json', 'shopping_items'],
  ['data/conversion-profiles.json', 'ingredient_conversion_profiles'],
] as const satisfies readonly [Exclude<(typeof COMPLETE_BACKUP_DATA_PATHS)[number], 'data/pair.json' | 'data/photo-metadata.json'>, string][]

function sortRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  return [...rows].sort((left, right) => String(left.id ?? '').localeCompare(String(right.id ?? '')))
}

async function pendingMutationCount(context: QueryContext, pairId: string): Promise<number> {
  const row = await context.getOptional<{ count: number }>(
    'SELECT COUNT(*) AS count FROM mutation_outbox WHERE pair_id = ?',
    [pairId],
  )
  const count = Number(row?.count ?? 0)
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid local mutation queue count')
  return count
}

async function pendingMediaCount(database: PowerSyncDatabase, pairId: string): Promise<number> {
  const jobs = await new MediaUploadQueueStore(database).load()
  return jobs.filter((job) => job.pairId === pairId).length
}

async function requireDrainedQueues(database: PowerSyncDatabase, pairId: string): Promise<void> {
  const [mutations, media] = await Promise.all([
    pendingMutationCount(database, pairId),
    pendingMediaCount(database, pairId),
  ])
  if (mutations > 0 || media > 0) {
    throw new BackupRequiresSyncError(
      `Backup completo aguardando sincronização: ${mutations} alteração(ões) e ${media} mídia(s) pendente(s).`,
    )
  }
}

async function rowsForPair(context: QueryContext, table: string, pairId: string): Promise<Record<string, unknown>[]> {
  return sortRows(await context.getAll<Record<string, unknown>>(
    `SELECT * FROM ${table} WHERE pair_id = ? ORDER BY id ASC`,
    [pairId],
  ))
}

async function photoRowsForPair(context: QueryContext, table: string, pairId: string): Promise<CompleteBackupPhotoRow[]> {
  const rows = await context.getAll<CompleteBackupPhotoRow>(
    `SELECT * FROM ${table} WHERE pair_id = ? ORDER BY id ASC`,
    [pairId],
  )
  return [...rows].sort((left, right) => left.id.localeCompare(right.id))
}

export async function captureCompleteBackupSnapshot(
  database: PowerSyncDatabase,
  pairId: string,
  createdAt = new Date().toISOString(),
): Promise<CompleteBackupSnapshot> {
  if (!pairId.trim()) throw new Error('Backup pairId is required')
  if (!Number.isFinite(Date.parse(createdAt)) || new Date(Date.parse(createdAt)).toISOString() !== createdAt) {
    throw new Error('Backup snapshot timestamp must be normalized ISO')
  }

  await requireDrainedQueues(database, pairId)

  const snapshot = await database.readTransaction(async (tx) => {
    if (await pendingMutationCount(tx, pairId) > 0) throw new BackupRequiresSyncError()

    const tableRows = await Promise.all(DATA_TABLES.map(async ([path, table]) => ({
      path,
      rows: await rowsForPair(tx, table, pairId),
    })))
    const [recipePhotos, cookingPhotos] = await Promise.all([
      photoRowsForPair(tx, 'recipe_photos', pairId),
      photoRowsForPair(tx, 'cooking_session_photos', pairId),
    ])

    const photos: CompleteBackupSnapshot['photos'] = [
      ...recipePhotos.map((row) => ({ ...row, ownerType: 'recipe' as const })),
      ...cookingPhotos.map((row) => ({ ...row, ownerType: 'cooking_session' as const })),
    ].sort((left, right) => left.id.localeCompare(right.id))

    for (const photo of photos) {
      if (photo.storage_state !== 'uploaded') {
        throw new BackupRequiresSyncError(`A mídia ${photo.id} ainda não está confirmada no armazenamento remoto.`)
      }
      if (!photo.storage_path.trim() || !photo.mime_type.startsWith('image/')) {
        throw new Error(`Invalid canonical media metadata for ${photo.id}`)
      }
    }

    const dataEntries: CompleteBackupSnapshot['dataEntries'] = [
      {
        path: 'data/pair.json',
        bytes: encodeBackupJson({ sourcePairId: pairId, exportedAt: createdAt }),
      },
      ...tableRows.map(({ path, rows }) => ({ path, bytes: encodeBackupJson(rows) })),
      {
        path: 'data/photo-metadata.json',
        bytes: encodeBackupJson(photos),
      },
    ]

    return { createdAt, pairId, dataEntries, photos }
  })

  // A media job can be queued independently of the semantic mutation transaction.
  // Recheck after the read transaction so a newly prepared photo cannot be omitted
  // from an archive labeled complete.
  await requireDrainedQueues(database, pairId)
  return snapshot
}
