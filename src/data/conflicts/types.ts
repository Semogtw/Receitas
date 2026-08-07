import type { JsonObject } from '../mutations/types'

export interface ConflictRecord {
  id: string
  pair_id: string
  entity_type: string
  entity_id: string
  base_revision: number | null
  base_payload: string | null
  local_payload: string
  remote_payload: string
  status: 'open' | 'resolved'
  resolution_strategy: 'choose_local' | 'choose_remote' | 'merge' | null
  resolution_payload: string | null
  resolved_by: string | null
  created_at: string
  resolved_at: string | null
}

export interface ParsedConflict extends Omit<ConflictRecord, 'base_payload' | 'local_payload' | 'remote_payload' | 'resolution_payload'> {
  base: JsonObject | null
  local: JsonObject
  remote: JsonObject
  resolution: JsonObject | null
}

function parseObject(value: string | null, label: string): JsonObject | null {
  if (value === null) return null
  const parsed: unknown = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`Invalid ${label} conflict payload`)
  return parsed as JsonObject
}

export function parseConflict(record: ConflictRecord): ParsedConflict {
  const local = parseObject(record.local_payload, 'local')
  const remote = parseObject(record.remote_payload, 'remote')
  if (!local || !remote) throw new Error('Open conflict requires local and remote payloads')

  const { base_payload: _base, local_payload: _local, remote_payload: _remote, resolution_payload: _resolution, ...metadata } = record
  return {
    ...metadata,
    base: parseObject(record.base_payload, 'base'),
    local,
    remote,
    resolution: parseObject(record.resolution_payload, 'resolution'),
  }
}
