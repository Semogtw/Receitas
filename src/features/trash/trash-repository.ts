import type { PowerSyncDatabase } from '@powersync/web'
import { performLocalMutation } from '../../data/mutations/performLocalMutation'
import { resolveMutationBase } from '../../data/mutations/resolveMutationBase'
import { createMutationEnvelope, type JsonObject, type MutationEnvelope } from '../../data/mutations/types'
import { SYNCABLE_ENTITY_TYPES, type SyncableEntityType } from '../../data/schema'
import { getSupabaseClient } from '../../lib/supabase/client'

export interface TrashEntry {
  entityType: SyncableEntityType
  entityId: string
  label: string
  deletedAt: string
  updatedAt: string | null
}

export interface TrashScope {
  pairId: string
  actorUserId: string
}

type MutationWriter = (database: PowerSyncDatabase, envelope: MutationEnvelope) => Promise<string>
type PermanentDeleteGateway = (entityType: SyncableEntityType, entityId: string, pairId: string) => Promise<void>

interface TrashRow extends Record<string, unknown> {
  id: string
}

function assertEntityType(value: SyncableEntityType): SyncableEntityType {
  if (!(SYNCABLE_ENTITY_TYPES as readonly string[]).includes(value)) {
    throw new Error('Unsupported trash entity type')
  }
  return value
}

function toPayload(row: TrashRow): JsonObject {
  const payload: JsonObject = {}
  for (const [key, value] of Object.entries(row)) {
    if (key === 'id' || value === undefined) continue
    payload[key] = value as JsonObject[string]
  }
  return payload
}

function labelForRow(entityType: SyncableEntityType, row: TrashRow): string {
  const candidates: unknown[] = [
    row.title,
    row.name,
    row.item_name,
    row.ingredient_name,
    row.instruction,
    row.shared_observation,
    row.source_url,
  ]
  const label = candidates.find((value) => typeof value === 'string' && value.trim())
  if (typeof label === 'string') return label.trim().slice(0, 120)
  return `${entityType.replaceAll('_', ' ')} · ${row.id.slice(0, 8)}`
}

async function defaultPermanentDelete(
  entityType: SyncableEntityType,
  entityId: string,
  _pairId: string,
): Promise<void> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.functions.invoke('permanent-delete', {
    body: { entityType, entityId },
  })
  if (error) throw error
  if (!data || data.ok !== true) throw new Error('Permanent deletion was not confirmed by the server')
}

export class TrashRepository {
  constructor(
    private readonly database: PowerSyncDatabase,
    private readonly scope: TrashScope,
    private readonly writeMutation: MutationWriter = performLocalMutation,
    private readonly permanentDeleteGateway: PermanentDeleteGateway = defaultPermanentDelete,
  ) {}

  async softDelete(entityTypeInput: SyncableEntityType, entityId: string): Promise<void> {
    const entityType = assertEntityType(entityTypeInput)
    const row = await this.database.getOptional<TrashRow>(
      `SELECT * FROM ${entityType} WHERE id = ? AND pair_id = ? LIMIT 1`,
      [entityId, this.scope.pairId],
    )
    if (!row) throw new Error('Trash entity not found')
    if (row.deleted_at) return

    const current = toPayload(row)
    const base = await resolveMutationBase(this.database, entityType, entityId, current)
    const now = new Date().toISOString()
    await this.writeMutation(this.database, createMutationEnvelope({
      pairId: this.scope.pairId,
      actorUserId: this.scope.actorUserId,
      entityType,
      entityId,
      operation: 'soft_delete',
      ...base,
      next: { ...current, deleted_at: now, updated_at: now },
    }))
  }

  async restore(entityTypeInput: SyncableEntityType, entityId: string): Promise<void> {
    const entityType = assertEntityType(entityTypeInput)
    const row = await this.database.getOptional<TrashRow>(
      `SELECT * FROM ${entityType} WHERE id = ? AND pair_id = ? AND deleted_at IS NOT NULL LIMIT 1`,
      [entityId, this.scope.pairId],
    )
    if (!row) throw new Error('Deleted entity not found')

    const current = toPayload(row)
    const base = await resolveMutationBase(this.database, entityType, entityId, current)
    await this.writeMutation(this.database, createMutationEnvelope({
      pairId: this.scope.pairId,
      actorUserId: this.scope.actorUserId,
      entityType,
      entityId,
      operation: 'update',
      ...base,
      next: { ...current, deleted_at: null, updated_at: new Date().toISOString() },
    }))
  }

  async listTrash(): Promise<TrashEntry[]> {
    const groups = await Promise.all(SYNCABLE_ENTITY_TYPES.map(async (entityType) => {
      const rows = await this.database.getAll<TrashRow>(
        `SELECT * FROM ${entityType} WHERE pair_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC`,
        [this.scope.pairId],
      )
      return rows.map((row): TrashEntry => ({
        entityType,
        entityId: row.id,
        label: labelForRow(entityType, row),
        deletedAt: String(row.deleted_at),
        updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
      }))
    }))

    return groups.flat().sort((left, right) => right.deletedAt.localeCompare(left.deletedAt))
  }

  async permanentlyDelete(entityTypeInput: SyncableEntityType, entityId: string): Promise<void> {
    const entityType = assertEntityType(entityTypeInput)
    const row = await this.database.getOptional<TrashRow>(
      `SELECT id, deleted_at FROM ${entityType} WHERE id = ? AND pair_id = ? AND deleted_at IS NOT NULL LIMIT 1`,
      [entityId, this.scope.pairId],
    )
    if (!row) throw new Error('Only an entity already in the trash can be permanently deleted')

    const pending = await this.database.get<{ count: number | string | null }>(
      'SELECT count(*) AS count FROM mutation_outbox WHERE entity_type = ? AND entity_id = ?',
      [entityType, entityId],
    )
    if (Number(pending.count ?? 0) > 0) {
      throw new Error('Cannot permanently delete an entity with a pending local mutation')
    }

    await this.permanentDeleteGateway(entityType, entityId, this.scope.pairId)
  }
}
