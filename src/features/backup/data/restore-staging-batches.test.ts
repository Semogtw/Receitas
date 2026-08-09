import { describe, expect, it } from 'vitest'
import { encodeBackupJson, sha256Hex, type BackupFileDescriptor } from '../domain/complete-backup-format'
import { RESTORE_DATA_BATCH_HARD_BYTES, splitRestoreDataBatches } from './restore-staging-batches'

async function descriptor(path: string, value: unknown): Promise<BackupFileDescriptor> {
  const bytes = encodeBackupJson(value)
  return { path, bytes: bytes.byteLength, sha256: await sha256Hex(bytes) }
}

describe('splitRestoreDataBatches', () => {
  it('keeps pair metadata in one canonical object batch', async () => {
    const value = { sourcePairId: 'pair-1', exportedAt: '2026-08-09T10:00:00.000Z' }
    const file = await descriptor('data/pair.json', value)

    expect(splitRestoreDataBatches({ path: file.path, value, descriptors: [file] })).toEqual([{
      path: file.path,
      batchIndex: 0,
      fileSha256: file.sha256,
      fileByteSize: file.bytes,
      payload: value,
      payloadByteSize: encodeBackupJson(value).byteLength,
    }])
  })

  it('splits table arrays into contiguous bounded batches while retaining whole-file identity', async () => {
    const value = Array.from({ length: 50 }, (_, index) => ({ id: `row-${index}`, note: 'x'.repeat(20_000) }))
    const file = await descriptor('data/recipes.json', value)
    const batches = splitRestoreDataBatches({ path: file.path, value, descriptors: [file] })

    expect(batches.length).toBeGreaterThan(1)
    expect(batches.map((item) => item.batchIndex)).toEqual(batches.map((_, index) => index))
    expect(batches.every((item) => item.payloadByteSize <= RESTORE_DATA_BATCH_HARD_BYTES)).toBe(true)
    expect(batches.every((item) => item.fileSha256 === file.sha256 && item.fileByteSize === file.bytes)).toBe(true)
    expect(batches.flatMap((item) => item.payload as unknown[])).toEqual(value)
  })

  it('still stages an empty canonical table as batch zero', async () => {
    const value: unknown[] = []
    const file = await descriptor('data/shopping-items.json', value)
    const batches = splitRestoreDataBatches({ path: file.path, value, descriptors: [file] })

    expect(batches).toHaveLength(1)
    expect(batches[0]).toMatchObject({ batchIndex: 0, payload: [] })
  })

  it('rejects a single row that cannot fit in the server request ceiling', async () => {
    const value = [{ id: 'too-large', text: 'x'.repeat(RESTORE_DATA_BATCH_HARD_BYTES + 1024) }]
    const file = await descriptor('data/recipes.json', value)

    expect(() => splitRestoreDataBatches({ path: file.path, value, descriptors: [file] }))
      .toThrow('single restore row exceeds')
  })
})
