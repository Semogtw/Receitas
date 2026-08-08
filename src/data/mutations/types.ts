import type { SyncableEntityType } from '../schema'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject
export interface JsonObject {
  [key: string]: JsonValue
}

export type MutationOperation = 'create' | 'update' | 'soft_delete'

export interface MutationEnvelope<T extends JsonObject = JsonObject> {
  mutationId: string
  pairId: string
  actorUserId: string
  entityType: SyncableEntityType
  entityId: string
  operation: MutationOperation
  baseRevision: number | null
  base: T | null
  next: T
  createdAt: string
}

export type CreateMutationEnvelopeInput<T extends JsonObject = JsonObject> =
  Omit<MutationEnvelope<T>, 'mutationId' | 'createdAt'> & {
    mutationId?: string
    createdAt?: string
  }

export function createMutationEnvelope<T extends JsonObject = JsonObject>(
  input: CreateMutationEnvelopeInput<T>,
): MutationEnvelope<T> {
  return {
    ...input,
    mutationId: input.mutationId ?? crypto.randomUUID(),
    createdAt: input.createdAt ?? new Date().toISOString(),
  }
}
