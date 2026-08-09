import { BlobWriter, Uint8ArrayReader, ZipWriter } from '@zip.js/zip.js'
import { describe, expect, it, vi } from 'vitest'
import {
  COMPLETE_BACKUP_DATA_PATHS,
  createBackupManifest,
  encodeBackupJson,
  sha256Hex,
} from '../domain/complete-backup-format'
import { RestoreStagingService } from './restore-staging-service'

const pairId = '20000000-0000-4000-8000-000000000002'
const jobId = '30000000-0000-4000-8000-000000000003'
const createdAt = '2026-08-09T10:00:00.000Z'

async function archive(options: { corruptRecipes?: boolean } = {}): Promise<Blob> {
  const values = new Map<string, unknown>()
  for (const path of COMPLETE_BACKUP_DATA_PATHS) values.set(path, [])
  values.set('data/pair.json', { sourcePairId: pairId, exportedAt: createdAt })

  const entries = await Promise.all(COMPLETE_BACKUP_DATA_PATHS.map(async (path) => {
    const bytes = encodeBackupJson(values.get(path))
    return { path, bytes, sha256: await sha256Hex(bytes) }
  }))
  const manifest = createBackupManifest({
    createdAt,
    appVersion: '0.0.0-test',
    pairExportId: 'export-1',
    dataFiles: entries.map((entry) => ({ path: entry.path, bytes: entry.bytes.byteLength, sha256: entry.sha256 })),
    mediaFiles: [],
  })

  const writerTarget = new BlobWriter('application/zip')
  const writer = new ZipWriter(writerTarget)
  for (const entry of entries) {
    const content = options.corruptRecipes && entry.path === 'data/recipes.json'
      ? encodeBackupJson([{ id: 'tampered', pair_id: pairId }])
      : entry.bytes
    await writer.add(entry.path, new Uint8ArrayReader(content))
  }
  await writer.add('manifest.json', new Uint8ArrayReader(encodeBackupJson(manifest)))
  await writer.close()
  return writerTarget.getData()
}

function fakeClient() {
  const actions: string[] = []
  const invoke = vi.fn(async (_name: string, options: { body: Record<string, unknown> }) => {
    const action = String(options.body.action)
    actions.push(action)
    if (action === 'create_job') {
      return {
        data: {
          job: {
            id: jobId,
            pairId,
            mode: 'merge',
            status: 'uploading',
            manifestSha256: 'a'.repeat(64),
            safetyBackupId: null,
            expiresAt: '2026-08-10T10:00:00.000Z',
          },
        },
        error: null,
      }
    }
    if (action === 'finalize_staging') {
      return {
        data: {
          job: {
            id: jobId,
            pairId,
            mode: 'merge',
            status: 'ready_to_commit',
            manifestSha256: 'a'.repeat(64),
            safetyBackupId: null,
            expiresAt: '2026-08-10T10:00:00.000Z',
          },
        },
        error: null,
      }
    }
    return { data: { ok: true }, error: null }
  })
  const uploadToSignedUrl = vi.fn()
  return {
    actions,
    client: {
      functions: { invoke },
      storage: { from: vi.fn(() => ({ uploadToSignedUrl })) },
    },
    invoke,
    uploadToSignedUrl,
  }
}

describe('RestoreStagingService', () => {
  it('finishes local preflight before creating the remote restore job', async () => {
    const fake = fakeClient()
    const progress: string[] = []
    const service = new RestoreStagingService(fake.client)

    const result = await service.stageArchive(await archive(), 'merge', (item) => {
      progress.push(`${item.stage}:${item.completed}/${item.total}`)
    })

    expect(result.status).toBe('ready_to_commit')
    expect(fake.actions[0]).toBe('create_job')
    expect(fake.actions.filter((action) => action === 'stage_data')).toHaveLength(COMPLETE_BACKUP_DATA_PATHS.length)
    expect(fake.actions.at(-1)).toBe('finalize_staging')
    expect(fake.uploadToSignedUrl).not.toHaveBeenCalled()
    expect(progress.slice(0, 2)).toEqual(['preflight:0/1', 'preflight:1/1'])
  })

  it('never contacts restore staging when the local archive checksum preflight fails', async () => {
    const fake = fakeClient()
    const service = new RestoreStagingService(fake.client)

    await expect(service.stageArchive(await archive({ corruptRecipes: true }), 'merge'))
      .rejects.toThrow('checksum mismatch')
    expect(fake.invoke).not.toHaveBeenCalled()
    expect(fake.actions).toEqual([])
  })
})
