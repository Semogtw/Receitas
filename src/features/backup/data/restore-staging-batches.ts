import { encodeBackupJson, type BackupFileDescriptor } from '../domain/complete-backup-format'

export const RESTORE_DATA_BATCH_TARGET_BYTES = 768 * 1024
export const RESTORE_DATA_BATCH_HARD_BYTES = 1024 * 1024

export interface RestoreDataBatchDraft {
  path: string
  batchIndex: number
  fileSha256: string
  fileByteSize: number
  payload: unknown
  payloadByteSize: number
}

function payloadBytes(value: unknown): number {
  return encodeBackupJson(value).byteLength
}

function descriptorFor(path: string, descriptors: readonly BackupFileDescriptor[]): BackupFileDescriptor {
  const descriptor = descriptors.find((entry) => entry.path === path)
  if (!descriptor) throw new Error(`Restore data descriptor not found for ${path}`)
  return descriptor
}

function batch(path: string, index: number, descriptor: BackupFileDescriptor, payload: unknown): RestoreDataBatchDraft {
  const payloadByteSize = payloadBytes(payload)
  if (payloadByteSize <= 0 || payloadByteSize > RESTORE_DATA_BATCH_HARD_BYTES) {
    throw new Error(`Restore data batch exceeds the client limit for ${path}`)
  }
  return {
    path,
    batchIndex: index,
    fileSha256: descriptor.sha256,
    fileByteSize: descriptor.bytes,
    payload,
    payloadByteSize,
  }
}

export function splitRestoreDataBatches(input: {
  path: string
  value: unknown
  descriptors: readonly BackupFileDescriptor[]
}): RestoreDataBatchDraft[] {
  const descriptor = descriptorFor(input.path, input.descriptors)
  if (input.path === 'data/pair.json') {
    if (!input.value || typeof input.value !== 'object' || Array.isArray(input.value)) {
      throw new Error('Restore pair metadata must be an object')
    }
    return [batch(input.path, 0, descriptor, input.value)]
  }

  if (!Array.isArray(input.value)) throw new Error(`Restore table data must be an array for ${input.path}`)
  if (input.value.length === 0) return [batch(input.path, 0, descriptor, [])]

  const batches: RestoreDataBatchDraft[] = []
  let current: unknown[] = []

  for (const row of input.value) {
    const candidate = [...current, row]
    const candidateBytes = payloadBytes(candidate)
    if (candidateBytes <= RESTORE_DATA_BATCH_TARGET_BYTES || current.length === 0) {
      if (candidateBytes > RESTORE_DATA_BATCH_HARD_BYTES) {
        throw new Error(`A single restore row exceeds the staging request limit for ${input.path}`)
      }
      current = candidate
      continue
    }

    batches.push(batch(input.path, batches.length, descriptor, current))
    current = [row]
    if (payloadBytes(current) > RESTORE_DATA_BATCH_HARD_BYTES) {
      throw new Error(`A single restore row exceeds the staging request limit for ${input.path}`)
    }
  }

  if (current.length > 0) batches.push(batch(input.path, batches.length, descriptor, current))
  return batches
}
