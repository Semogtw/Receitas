import type { PowerSyncDatabase } from '@powersync/web'
import { createMutationEnvelope, type JsonObject } from '../../../data/mutations/types'
import { performLocalMutation } from '../../../data/mutations/performLocalMutation'
import { resolveMutationBase } from '../../../data/mutations/resolveMutationBase'
import { sha256Hex } from '../domain/complete-backup-format'
import type { CompleteBackupPhotoRow } from './complete-backup-snapshot'

interface DatabaseRow extends Record<string, unknown> { id: string }

function payloadFromRow(row: DatabaseRow): JsonObject {
  const payload: JsonObject = {}
  for (const [key, value] of Object.entries(row)) {
    if (key === 'id' || value === undefined) continue
    payload[key] = value as JsonObject[string]
  }
  return payload
}

export interface PhotoDigestBackfillScope {
  pairId: string
  actorUserId: string
}

export async function backfillPhotoDigestIfNeeded(input: {
  database: PowerSyncDatabase
  scope: PhotoDigestBackfillScope
  photo: CompleteBackupPhotoRow & { ownerType: 'recipe' | 'cooking_session' }
  blob: Blob
}): Promise<boolean> {
  const needsSha = input.photo.sha256 === null
  const needsSize = input.photo.byte_size === null || input.photo.byte_size === undefined
  if (!needsSha && !needsSize) return false
  if (input.blob.type && input.blob.type !== input.photo.mime_type) {
    throw new Error(`Legacy photo MIME type mismatch for ${input.photo.id}`)
  }

  const entityType = input.photo.ownerType === 'recipe' ? 'recipe_photos' : 'cooking_session_photos'
  const row = await input.database.getOptional<DatabaseRow>(
    `SELECT * FROM ${entityType} WHERE id = ? AND pair_id = ? LIMIT 1`,
    [input.photo.id, input.scope.pairId],
  )
  if (!row) throw new Error(`Legacy photo metadata disappeared before digest backfill: ${input.photo.id}`)

  const current = payloadFromRow(row)
  const base = await resolveMutationBase(input.database, entityType, input.photo.id, current)
  const sha256 = needsSha ? await sha256Hex(await input.blob.arrayBuffer()) : input.photo.sha256
  await performLocalMutation(input.database, createMutationEnvelope({
    pairId: input.scope.pairId,
    actorUserId: input.scope.actorUserId,
    entityType,
    entityId: input.photo.id,
    operation: 'update',
    ...base,
    next: {
      ...current,
      sha256,
      byte_size: input.blob.size,
      updated_at: new Date().toISOString(),
    },
  }))
  return true
}
