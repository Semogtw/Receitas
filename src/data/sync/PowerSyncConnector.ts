import type { PowerSyncBackendConnector } from '@powersync/web'
import { readPublicEnv } from '../../lib/env'
import { getSupabaseClient } from '../../lib/supabase/client'
import { SYNCABLE_ENTITY_TYPES, type SyncableEntityType } from '../schema'
import type { JsonObject, MutationOperation } from '../mutations/types'

interface ConnectorScope {
  userId: string
  pairId: string
}

interface PendingMutationRow {
  id: string
  pair_id: string
  actor_user_id: string
  entity_type: string
  entity_id: string
  operation: MutationOperation
  base_revision: number | null
  base_payload: string | null
  next_payload: string
  created_at: string
}

interface MutationRpcResult {
  result_status: 'applied' | 'conflict_created'
  resulting_revision: number | null
  conflict_id: string | null
}

type UploadDatabase = Parameters<PowerSyncBackendConnector['uploadData']>[0]

function isSyncableEntityType(value: string): value is SyncableEntityType {
  return (SYNCABLE_ENTITY_TYPES as readonly string[]).includes(value)
}

function parseJsonObject(value: string | null, label: string): JsonObject | null {
  if (value === null) return null
  const parsed: unknown = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`)
  }
  return parsed as JsonObject
}

function uniqueTouchedEntities(crud: ReadonlyArray<{ table: string; id: string }>): Array<{ entityType: SyncableEntityType; entityId: string }> {
  const seen = new Set<string>()
  const entities: Array<{ entityType: SyncableEntityType; entityId: string }> = []

  for (const entry of crud) {
    if (!isSyncableEntityType(entry.table)) continue
    const key = `${entry.table}:${entry.id}`
    if (seen.has(key)) continue
    seen.add(key)
    entities.push({ entityType: entry.table, entityId: entry.id })
  }

  return entities
}

export class ReceitasPowerSyncConnector implements PowerSyncBackendConnector {
  constructor(private readonly scope: ConnectorScope) {}

  async fetchCredentials() {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token
    if (error || !accessToken) throw new Error('PowerSync requires an authenticated Supabase session')

    return {
      endpoint: readPublicEnv().powersyncUrl,
      token: accessToken,
    }
  }

  async uploadData(database: UploadDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction()
    if (!transaction) return

    const touched = uniqueTouchedEntities(transaction.crud)

    try {
      for (const { entityType, entityId } of touched) {
        const pending = await database.getOptional<PendingMutationRow>(
          `SELECT id, pair_id, actor_user_id, entity_type, entity_id, operation,
                  base_revision, base_payload, next_payload, created_at
             FROM mutation_outbox
            WHERE entity_type = ? AND entity_id = ?
            ORDER BY created_at ASC
            LIMIT 1`,
          [entityType, entityId],
        )

        // A previous CRUD transaction may already have uploaded a coalesced
        // semantic mutation for this entity. In that case this CRUD row is only
        // a redundant local history entry and can be acknowledged safely.
        if (!pending) continue

        if (pending.pair_id !== this.scope.pairId || pending.actor_user_id !== this.scope.userId) {
          throw new Error('Semantic mutation scope does not match the active PowerSync connection')
        }
        if (pending.entity_type !== entityType || pending.entity_id !== entityId) {
          throw new Error('Semantic mutation identity does not match the PowerSync CRUD entry')
        }

        const base = parseJsonObject(pending.base_payload, 'base_payload')
        const next = parseJsonObject(pending.next_payload, 'next_payload')
        if (!next) throw new Error('next_payload is required')

        const supabase = getSupabaseClient()
        const { data, error } = await supabase.rpc('apply_client_mutation', {
          p_mutation_id: pending.id,
          p_pair_id: pending.pair_id,
          p_actor_user_id: pending.actor_user_id,
          p_entity_type: pending.entity_type,
          p_entity_id: pending.entity_id,
          p_operation: pending.operation,
          p_base_revision: pending.base_revision,
          p_base_payload: base,
          p_next_payload: next,
        })

        if (error) throw error
        const result = (Array.isArray(data) ? data[0] : data) as MutationRpcResult | null
        if (!result || (result.result_status !== 'applied' && result.result_status !== 'conflict_created')) {
          throw new Error('Semantic mutation RPC returned an unknown result')
        }

        // Delete only the exact intent we just acknowledged. If a newer local
        // edit changed next_payload while the request was in flight, this
        // condition intentionally matches zero rows and preserves that edit.
        await database.execute(
          'DELETE FROM mutation_outbox WHERE id = ? AND next_payload = ?',
          [pending.id, pending.next_payload],
        )
      }

      await transaction.complete()
    } catch (error) {
      for (const { entityType, entityId } of touched) {
        await database.execute(
          `UPDATE mutation_outbox
              SET attempt_count = attempt_count + 1,
                  last_error = 'upload_failed'
            WHERE entity_type = ? AND entity_id = ?`,
          [entityType, entityId],
        )
      }
      throw error
    }
  }
}
