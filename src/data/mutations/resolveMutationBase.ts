import type { SyncableEntityType } from '../schema'
import type { JsonObject } from './types'

interface PendingBaseRow {
  base_revision: number | null
  base_payload: string | null
}

export interface MutationBaseDatabase {
  getOptional<T>(sql: string, params?: unknown[]): Promise<T | null>
}

export interface MutationBase {
  baseRevision: number | null
  base: JsonObject | null
}

function parseBasePayload(value: string | null): JsonObject | null {
  if (value === null) return null
  const parsed: unknown = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Pending mutation base payload must be a JSON object')
  }
  return parsed as JsonObject
}

export async function resolveMutationBase(
  database: MutationBaseDatabase,
  entityType: SyncableEntityType,
  entityId: string,
  currentRow: JsonObject | null,
): Promise<MutationBase> {
  const pending = await database.getOptional<PendingBaseRow>(
    `SELECT base_revision, base_payload
       FROM mutation_outbox
      WHERE entity_type = ? AND entity_id = ?
      ORDER BY created_at ASC
      LIMIT 1`,
    [entityType, entityId],
  )

  if (pending) {
    return {
      baseRevision: pending.base_revision,
      base: parseBasePayload(pending.base_payload),
    }
  }

  if (!currentRow) return { baseRevision: null, base: null }

  const revision = currentRow.revision
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) {
    throw new Error('Current synchronized row must contain a non-negative integer revision')
  }

  return { baseRevision: revision, base: currentRow }
}
