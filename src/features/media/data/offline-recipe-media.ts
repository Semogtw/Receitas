import type { PowerSyncDatabase } from '@powersync/web'
import type { MediaRuntime } from '../media-runtime'

const PREFERENCE_PREFIX = 'offline_recipe_media:'

interface PreferenceRow {
  value_json: string
}

interface MediaRow {
  id: string
  storage_path: string
}

export interface OfflineRecipeMediaPreference {
  version: 1
  enabled: boolean
  updatedAt: string
}

export interface OfflineRecipeMediaStatus {
  enabled: boolean
  total: number
  cached: number
  missing: number
  state: 'disabled' | 'available' | 'partial'
}

export interface OfflineRecipeMediaPrepareResult extends OfflineRecipeMediaStatus {
  failed: number
}

function preferenceKey(recipeId: string): string {
  if (!recipeId.trim()) throw new Error('Recipe id is required for offline media')
  return `${PREFERENCE_PREFIX}${recipeId}`
}

function parsePreference(value: string): OfflineRecipeMediaPreference | null {
  try {
    const parsed = JSON.parse(value) as Partial<OfflineRecipeMediaPreference>
    if (parsed.version !== 1 || parsed.enabled !== true || typeof parsed.updatedAt !== 'string') return null
    return { version: 1, enabled: true, updatedAt: parsed.updatedAt }
  } catch {
    return null
  }
}

export class OfflineRecipeMediaManager {
  constructor(
    private readonly database: PowerSyncDatabase,
    private readonly runtime: Pick<MediaRuntime, 'resolveBlob' | 'hasCachedBlob'>,
    private readonly pairId: string,
  ) {}

  async isEnabled(recipeId: string): Promise<boolean> {
    const row = await this.database.getOptional<PreferenceRow>(
      'SELECT value_json FROM device_preferences WHERE id = ? LIMIT 1',
      [preferenceKey(recipeId)],
    )
    return row ? parsePreference(row.value_json)?.enabled === true : false
  }

  async setEnabled(recipeId: string, enabled: boolean): Promise<void> {
    const key = preferenceKey(recipeId)
    if (!enabled) {
      await this.database.execute('DELETE FROM device_preferences WHERE id = ?', [key])
      return
    }

    const now = new Date().toISOString()
    const preference: OfflineRecipeMediaPreference = { version: 1, enabled: true, updatedAt: now }
    await this.database.execute(
      `INSERT INTO device_preferences (id, value_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         value_json = excluded.value_json,
         updated_at = excluded.updated_at`,
      [key, JSON.stringify(preference), now],
    )
  }

  async listMedia(recipeId: string): Promise<MediaRow[]> {
    return this.database.getAll<MediaRow>(
      `SELECT id, storage_path
         FROM recipe_photos
        WHERE pair_id = ?
          AND recipe_id = ?
          AND deleted_at IS NULL
       UNION ALL
       SELECT photo.id, photo.storage_path
         FROM cooking_session_photos photo
         JOIN cooking_sessions session
           ON session.id = photo.cooking_session_id
          AND session.pair_id = photo.pair_id
        WHERE session.pair_id = ?
          AND session.recipe_id = ?
          AND session.deleted_at IS NULL
          AND photo.deleted_at IS NULL
        ORDER BY id ASC`,
      [this.pairId, recipeId, this.pairId, recipeId],
    )
  }

  async inspect(recipeId: string): Promise<OfflineRecipeMediaStatus> {
    const enabled = await this.isEnabled(recipeId)
    const media = await this.listMedia(recipeId)
    let cached = 0
    for (const item of media) {
      if (await this.runtime.hasCachedBlob(item.id)) cached += 1
    }

    const missing = media.length - cached
    return {
      enabled,
      total: media.length,
      cached,
      missing,
      state: !enabled ? 'disabled' : missing === 0 ? 'available' : 'partial',
    }
  }

  async reconcile(recipeId: string): Promise<OfflineRecipeMediaPrepareResult> {
    const enabled = await this.isEnabled(recipeId)
    if (!enabled) return { ...await this.inspect(recipeId), failed: 0 }

    const media = await this.listMedia(recipeId)
    let failed = 0

    for (const item of media) {
      if (await this.runtime.hasCachedBlob(item.id)) continue
      try {
        await this.runtime.resolveBlob(item.id, item.storage_path)
      } catch {
        failed += 1
      }
    }

    const status = await this.inspect(recipeId)
    return { ...status, failed }
  }

  async prepare(recipeId: string): Promise<OfflineRecipeMediaPrepareResult> {
    await this.setEnabled(recipeId, true)
    return this.reconcile(recipeId)
  }
}
