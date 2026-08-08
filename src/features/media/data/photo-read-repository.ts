import type { PowerSyncDatabase } from '@powersync/web'

export interface PhotoMetadata {
  id: string
  storagePath: string
  position: number
  caption: string | null
  createdAt: string
}

interface PhotoRow {
  id: string
  storage_path: string
  position: number
  caption: string | null
  created_at: string
}

function mapPhoto(row: PhotoRow): PhotoMetadata {
  return {
    id: row.id,
    storagePath: row.storage_path,
    position: row.position,
    caption: row.caption,
    createdAt: row.created_at,
  }
}

export class PhotoReadRepository {
  constructor(
    private readonly database: PowerSyncDatabase,
    private readonly pairId: string,
  ) {}

  async listRecipePhotos(recipeId: string): Promise<PhotoMetadata[]> {
    const rows = await this.database.getAll<PhotoRow>(
      `SELECT id, storage_path, position, caption, created_at
         FROM recipe_photos
        WHERE recipe_id = ?
          AND pair_id = ?
          AND deleted_at IS NULL
        ORDER BY position ASC, created_at ASC, id ASC`,
      [recipeId, this.pairId],
    )
    return rows.map(mapPhoto)
  }

  async listCookingSessionPhotos(sessionId: string): Promise<PhotoMetadata[]> {
    const rows = await this.database.getAll<PhotoRow>(
      `SELECT id, storage_path, position, caption, created_at
         FROM cooking_session_photos
        WHERE cooking_session_id = ?
          AND pair_id = ?
          AND deleted_at IS NULL
        ORDER BY position ASC, created_at ASC, id ASC`,
      [sessionId, this.pairId],
    )
    return rows.map(mapPhoto)
  }
}
