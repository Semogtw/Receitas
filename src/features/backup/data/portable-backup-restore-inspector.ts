import type { PowerSyncDatabase } from '@powersync/web'
import { parsePortableBackup } from '../domain/portable-backup'
import { previewPortableBackupImport, type PortableBackupImportPreview } from '../domain/portable-backup-import-preview'

export type PortableBackupCollisionEntity =
  | 'categories'
  | 'recipes'
  | 'recipe_ingredients'
  | 'recipe_steps'
  | 'cooking_sessions'
  | 'cooking_ratings'
  | 'recipe_photos'
  | 'cooking_session_photos'

export interface PortableBackupRestoreCollision {
  entityType: PortableBackupCollisionEntity
  id: string
}

export interface PortableBackupRestoreInspection extends PortableBackupImportPreview {
  canApply: boolean
  collisions: PortableBackupRestoreCollision[]
}

interface IdRow extends Record<string, unknown> {
  id: string
}

async function findCollisions(
  database: PowerSyncDatabase,
  pairId: string,
  entityType: PortableBackupCollisionEntity,
  ids: readonly string[],
): Promise<PortableBackupRestoreCollision[]> {
  if (ids.length === 0) return []
  const placeholders = ids.map(() => '?').join(', ')
  const rows = await database.getAll<IdRow>(
    `SELECT id FROM ${entityType} WHERE pair_id = ? AND id IN (${placeholders})`,
    [pairId, ...ids],
  )
  const requested = new Set(ids)
  return rows
    .filter((row) => requested.has(row.id))
    .map((row) => ({ entityType, id: row.id }))
}

export async function inspectPortableBackupRestore(
  database: PowerSyncDatabase,
  serialized: string,
  targetPairId: string,
): Promise<PortableBackupRestoreInspection> {
  const preview = previewPortableBackupImport(serialized, targetPairId)
  if (!preview.canImport) {
    return { ...preview, canApply: false, collisions: [] }
  }

  const backup = parsePortableBackup(serialized)
  const idsByEntity: Record<PortableBackupCollisionEntity, string[]> = {
    categories: backup.categories.map((category) => category.id),
    recipes: backup.recipes.map((entry) => entry.recipe.id),
    recipe_ingredients: backup.recipes.flatMap((entry) => entry.recipe.ingredients.map((ingredient) => ingredient.id)),
    recipe_steps: backup.recipes.flatMap((entry) => entry.recipe.steps.map((step) => step.id)),
    cooking_sessions: backup.recipes.flatMap((entry) => entry.history.map((session) => session.id)),
    cooking_ratings: backup.recipes.flatMap((entry) => entry.history.flatMap((session) => session.ratings.map((rating) => rating.id))),
    recipe_photos: backup.recipes.flatMap((entry) => entry.photos.map((photo) => photo.id)),
    cooking_session_photos: backup.recipes.flatMap((entry) => Object.values(entry.sessionPhotos).flat().map((photo) => photo.id)),
  }

  const groups = await Promise.all(
    (Object.entries(idsByEntity) as [PortableBackupCollisionEntity, string[]][]).map(([entityType, ids]) =>
      findCollisions(database, targetPairId.trim(), entityType, ids),
    ),
  )
  const collisions = groups.flat().sort((a, b) => {
    const entity = a.entityType.localeCompare(b.entityType)
    return entity !== 0 ? entity : a.id.localeCompare(b.id)
  })

  return {
    ...preview,
    canApply: collisions.length === 0,
    collisions,
    errors: collisions.length === 0
      ? preview.errors
      : [...preview.errors, 'O backup usa identificadores que já existem neste caderno; a restauração foi bloqueada para evitar sobrescrita silenciosa.'],
  }
}
