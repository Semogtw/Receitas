import type { JsonObject, JsonValue } from '../mutations/types'

const metadataFields = new Set(['id', 'pair_id', 'revision', 'created_at', 'updated_at'])

function equalJson(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
}

export interface ConflictField {
  field: string
  base: JsonValue | undefined
  local: JsonValue | undefined
  remote: JsonValue | undefined
  localChanged: boolean
  remoteChanged: boolean
}

export function conflictFields(base: JsonObject | null, local: JsonObject, remote: JsonObject): ConflictField[] {
  const fields = new Set([...Object.keys(base ?? {}), ...Object.keys(local), ...Object.keys(remote)])

  return [...fields]
    .filter((field) => !metadataFields.has(field))
    .map((field) => {
      const baseValue = base?.[field]
      const localValue = local[field]
      const remoteValue = remote[field]
      return {
        field,
        base: baseValue,
        local: localValue,
        remote: remoteValue,
        localChanged: !equalJson(baseValue, localValue),
        remoteChanged: !equalJson(baseValue, remoteValue),
      }
    })
    .filter((field) => !equalJson(field.local, field.remote))
    .sort((a, b) => a.field.localeCompare(b.field, 'pt-BR'))
}

export type ConflictFieldChoice = 'local' | 'remote'

export function buildMergedResolution(
  remote: JsonObject,
  local: JsonObject,
  choices: Readonly<Record<string, ConflictFieldChoice>>,
): JsonObject {
  const result: JsonObject = structuredClone(remote)

  for (const [field, choice] of Object.entries(choices)) {
    if (metadataFields.has(field)) continue
    if (choice === 'local') {
      result[field] = local[field] ?? null
    }
  }

  for (const field of metadataFields) {
    if (field in remote) result[field] = remote[field]
  }

  return result
}
