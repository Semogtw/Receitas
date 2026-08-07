import type { PowerSyncDatabase } from '@powersync/web'
import { AppSchema, type SyncableEntityType } from '../schema'
import type { JsonObject, JsonValue, MutationEnvelope, MutationOperation } from './types'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const historicalActorFieldByEntity: Partial<Record<SyncableEntityType, string>> = {
  recipes: 'created_by',
  recipe_photos: 'created_by',
  cooking_sessions: 'recorded_by',
  cooking_session_photos: 'created_by',
  imports: 'created_by',
}

interface PendingMutationRow {
  id: string
  pair_id: string
  actor_user_id: string
  operation: MutationOperation
  base_revision: number | null
  base_payload: string | null
  next_payload: string
  created_at: string
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

function assertUuid(value: string, label: string): void {
  if (!uuidPattern.test(value)) throw new Error(`Invalid ${label}`)
}

function assertJsonSafe(value: JsonValue, path = 'payload'): void {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`${path} contains a non-finite number`)
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonSafe(item, `${path}[${index}]`))
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) assertJsonSafe(child, `${path}.${key}`)
  }
}

function validateEnvelope(envelope: MutationEnvelope): string[] {
  assertUuid(envelope.mutationId, 'mutationId')
  assertUuid(envelope.pairId, 'pairId')
  assertUuid(envelope.actorUserId, 'actorUserId')
  assertUuid(envelope.entityId, 'entityId')

  if (!Number.isFinite(Date.parse(envelope.createdAt))) throw new Error('Invalid mutation createdAt')
  if (envelope.baseRevision !== null && (!Number.isSafeInteger(envelope.baseRevision) || envelope.baseRevision < 0)) {
    throw new Error('Invalid baseRevision')
  }
  if (envelope.operation === 'create' && (envelope.baseRevision !== null || envelope.base !== null)) {
    throw new Error('Create mutation must not have a remote base')
  }
  if (envelope.operation !== 'create' && envelope.baseRevision !== null && envelope.base === null) {
    throw new Error('Existing remote entity mutation requires a base payload')
  }

  assertJsonSafe(envelope.next)
  if (envelope.base) assertJsonSafe(envelope.base)

  const table = AppSchema.findTable(envelope.entityType)
  if (!table || table.localOnly) throw new Error(`Unsupported semantic entity type: ${envelope.entityType}`)
  const allowedColumns = new Set(table.columns.map((column) => column.name))
  const payloadColumns = Object.keys(envelope.next)

  if (payloadColumns.length === 0) throw new Error('Mutation next payload cannot be empty')
  for (const column of payloadColumns) {
    if (!allowedColumns.has(column)) throw new Error(`Column ${column} is not allowed for ${envelope.entityType}`)
  }

  if (envelope.next.pair_id !== envelope.pairId) throw new Error('Mutation payload pair_id does not match its scope')
  const expectedRevision = envelope.baseRevision ?? 0
  if (envelope.next.revision !== expectedRevision) throw new Error('Local row revision must remain at the known remote base revision')

  if (envelope.base) {
    if (envelope.base.pair_id !== envelope.pairId) throw new Error('Mutation base pair_id does not match its scope')
    if (envelope.base.revision !== envelope.baseRevision) throw new Error('Mutation base payload revision does not match baseRevision')
  }

  if (envelope.entityType === 'cooking_session_ratings' && envelope.next.user_id !== envelope.actorUserId) {
    throw new Error('Rating user_id must match actorUserId')
  }

  const historicalActorField = historicalActorFieldByEntity[envelope.entityType]
  if (historicalActorField) {
    if (envelope.operation === 'create' && envelope.next[historicalActorField] !== envelope.actorUserId) {
      throw new Error(`Mutation actor field ${historicalActorField} must match actorUserId on create`)
    }
    if (envelope.base && envelope.next[historicalActorField] !== envelope.base[historicalActorField]) {
      throw new Error(`Historical actor field ${historicalActorField} is immutable`)
    }
  }

  if (envelope.operation === 'soft_delete' && typeof envelope.next.deleted_at !== 'string') {
    throw new Error('Soft delete mutation requires a deleted_at timestamp')
  }

  return payloadColumns.sort()
}

export function coalesceMutationOperation(previous: MutationOperation, incoming: MutationOperation): MutationOperation {
  if (previous === 'create') return 'create'
  if (previous === 'soft_delete') {
    if (incoming !== 'soft_delete') throw new Error('Cannot edit an entity after a pending soft delete')
    return 'soft_delete'
  }
  return incoming === 'soft_delete' ? 'soft_delete' : 'update'
}

async function writeEntity(
  tx: { execute<T = unknown>(sql: string, params?: unknown[]): Promise<T>; getOptional<T>(sql: string, params?: unknown[]): Promise<T | null> },
  envelope: MutationEnvelope,
  columns: string[],
): Promise<void> {
  const table = quoteIdentifier(envelope.entityType)

  if (envelope.operation === 'create') {
    const names = ['id', ...columns]
    const values = [envelope.entityId, ...columns.map((column) => envelope.next[column])]
    const placeholders = names.map(() => '?').join(', ')
    await tx.execute(
      `INSERT INTO ${table} (${names.map(quoteIdentifier).join(', ')}) VALUES (${placeholders})`,
      values,
    )
    return
  }

  const existing = await tx.getOptional<{ id: string }>(`SELECT id FROM ${table} WHERE id = ? LIMIT 1`, [envelope.entityId])
  if (!existing) throw new Error(`Cannot ${envelope.operation} missing ${envelope.entityType} ${envelope.entityId}`)

  const assignments = columns.map((column) => `${quoteIdentifier(column)} = ?`).join(', ')
  await tx.execute(
    `UPDATE ${table} SET ${assignments} WHERE id = ?`,
    [...columns.map((column) => envelope.next[column]), envelope.entityId],
  )
}

export async function applyLocalMutation(db: PowerSyncDatabase, envelope: MutationEnvelope): Promise<string> {
  const columns = validateEnvelope(envelope)

  return db.writeTransaction(async (tx) => {
    const pending = await tx.getOptional<PendingMutationRow>(
      `SELECT id, pair_id, actor_user_id, operation, base_revision, base_payload, next_payload, created_at
         FROM mutation_outbox
        WHERE entity_type = ? AND entity_id = ?
        ORDER BY created_at ASC
        LIMIT 1`,
      [envelope.entityType, envelope.entityId],
    )

    if (pending) {
      if (pending.pair_id !== envelope.pairId || pending.actor_user_id !== envelope.actorUserId) {
        throw new Error('Pending mutation scope does not match incoming mutation')
      }
      if (pending.base_revision !== envelope.baseRevision) {
        throw new Error('Pending mutation base revision does not match incoming mutation')
      }

      const historicalActorField = historicalActorFieldByEntity[envelope.entityType]
      if (pending.operation === 'create' && historicalActorField && envelope.next[historicalActorField] !== envelope.actorUserId) {
        throw new Error(`Historical actor field ${historicalActorField} cannot change while create is pending`)
      }
    } else if (envelope.operation !== 'create' && (envelope.baseRevision === null || envelope.base === null)) {
      throw new Error('Existing entity mutation without a pending create requires a remote base')
    }

    await writeEntity(tx, envelope, columns)

    if (pending) {
      const operation = coalesceMutationOperation(pending.operation, envelope.operation)
      await tx.execute(
        `UPDATE mutation_outbox
            SET operation = ?, next_payload = ?, attempt_count = 0, last_error = NULL
          WHERE id = ?`,
        [operation, JSON.stringify(envelope.next), pending.id],
      )
      return pending.id
    }

    await tx.execute(
      `INSERT INTO mutation_outbox (
        id, pair_id, actor_user_id, entity_type, entity_id, operation,
        base_revision, base_payload, next_payload, created_at, attempt_count, last_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`,
      [
        envelope.mutationId,
        envelope.pairId,
        envelope.actorUserId,
        envelope.entityType,
        envelope.entityId,
        envelope.operation,
        envelope.baseRevision,
        envelope.base ? JSON.stringify(envelope.base) : null,
        JSON.stringify(envelope.next),
        envelope.createdAt,
      ],
    )

    return envelope.mutationId
  })
}
