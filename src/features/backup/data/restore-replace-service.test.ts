import type { PowerSyncDatabase } from '@powersync/web'
import { describe, expect, it, vi } from 'vitest'
import type { BackupArtifact } from '../domain/complete-backup-format'
import type { RestoreJobSummary } from './restore-staging-service'
import { RestoreReplaceService } from './restore-replace-service'

const pairId = '20000000-0000-4000-8000-000000000002'
const actorUserId = '10000000-0000-4000-8000-000000000001'
const replaceJobId = '30000000-0000-4000-8000-000000000003'
const safetyJobId = '30000000-0000-4000-8000-000000000004'

function job(overrides: Partial<RestoreJobSummary> = {}): RestoreJobSummary {
  return {
    id: replaceJobId,
    pairId,
    mode: 'replace_all',
    status: 'ready_to_commit',
    manifestSha256: 'a'.repeat(64),
    safetyBackupId: null,
    expiresAt: '2026-08-10T10:00:00.000Z',
    ...overrides,
  }
}

function safetyArtifact(): BackupArtifact {
  const file = new File(['safety'], 'receitas-backup-safety.zip', { type: 'application/zip' })
  return {
    manifest: {
      format: 'receitas-backup',
      version: 1,
      createdAt: '2026-08-09T10:00:00.000Z',
      appVersion: '1.0.0',
      pairExportId: 'export-safety',
      dataFiles: [],
      mediaFiles: [],
    },
    filename: file.name,
    bytes: file.size,
    sha256: 'b'.repeat(64),
    file,
  }
}

function fakeEnvironment() {
  const events: string[] = []
  const replaceReady = job()
  const safetyReady = job({
    id: safetyJobId,
    mode: 'merge',
    safetyBackupId: null,
  })
  const staging = {
    stageArchive: vi.fn(async (_archive: Blob, mode: 'merge' | 'replace_all') => {
      events.push(`stage:${mode}`)
      return mode === 'replace_all' ? replaceReady : safetyReady
    }),
  }
  const backupFactory = vi.fn(async () => {
    events.push('backup')
    return safetyArtifact()
  })
  const invoke = vi.fn(async (_name: string, options: { body: Record<string, unknown> }) => {
    const action = String(options.body.action)
    events.push(`invoke:${action}`)
    if (action === 'attach_safety_backup') {
      return {
        data: {
          job: {
            ...replaceReady,
            safetyBackupId: safetyJobId,
          },
        },
        error: null,
      }
    }
    if (action === 'list_replace_media_promotion') {
      return {
        data: {
          media: [
            { path: 'media/already.webp', promoted: true },
            { path: 'media/pending.webp', promoted: false },
          ],
        },
        error: null,
      }
    }
    if (action === 'commit_replace_all') {
      return {
        data: {
          result: {
            insertedCount: 5,
            updatedCount: 7,
            replacedCount: 9,
          },
        },
        error: null,
      }
    }
    return { data: { promotion: { ok: true } }, error: null }
  })

  const service = new RestoreReplaceService(
    { functions: { invoke }, storage: { from: vi.fn() } } as never,
    {} as PowerSyncDatabase,
    pairId,
    actorUserId,
    '1.0.0',
    { download: vi.fn() },
    { staging, backupFactory: backupFactory as never },
  )

  return { service, staging, backupFactory, invoke, events, replaceReady, safetyReady }
}

describe('RestoreReplaceService', () => {
  it('stages incoming archives explicitly as replace_all before any destructive phase', async () => {
    const fake = fakeEnvironment()
    const incoming = new Blob(['incoming'], { type: 'application/zip' })

    const ready = await fake.service.stageIncoming(incoming)

    expect(ready).toEqual(fake.replaceReady)
    expect(fake.staging.stageArchive).toHaveBeenCalledWith(incoming, 'replace_all', undefined)
    expect(fake.invoke).not.toHaveBeenCalled()
  })

  it('creates the safety artifact, stages that exact file, then asks the server to attach it', async () => {
    const fake = fakeEnvironment()

    const prepared = await fake.service.prepareSafety(fake.replaceReady)

    expect(prepared.safetyArtifact.filename).toBe('receitas-backup-safety.zip')
    expect(prepared.safetyJob.id).toBe(safetyJobId)
    expect(prepared.replaceJob.safetyBackupId).toBe(safetyJobId)
    expect(fake.events).toEqual([
      'backup',
      'stage:merge',
      'invoke:attach_safety_backup',
    ])
    expect(fake.staging.stageArchive).toHaveBeenCalledWith(
      prepared.safetyArtifact.file,
      'merge',
      expect.any(Function),
    )
  })

  it('never stages or attaches a safety job when current-state backup generation fails', async () => {
    const fake = fakeEnvironment()
    fake.backupFactory.mockRejectedValueOnce(new Error('backup_requires_sync'))

    await expect(fake.service.prepareSafety(fake.replaceReady)).rejects.toThrow('backup_requires_sync')
    expect(fake.staging.stageArchive).not.toHaveBeenCalled()
    expect(fake.invoke).not.toHaveBeenCalled()
  })

  it('refuses replace commit locally when the attached safety job identity changed', async () => {
    const fake = fakeEnvironment()
    const prepared = {
      replaceJob: job({ safetyBackupId: '30000000-0000-4000-8000-000000000099' }),
      safetyJob: fake.safetyReady,
      safetyArtifact: safetyArtifact(),
    }

    await expect(fake.service.commitReplace(prepared)).rejects.toThrow('safety backup changed unexpectedly')
    expect(fake.invoke).not.toHaveBeenCalled()
  })

  it('promotes only pending incoming media before the final replace transaction', async () => {
    const fake = fakeEnvironment()
    const prepared = await fake.service.prepareSafety(fake.replaceReady)
    fake.events.length = 0
    const progress: string[] = []

    const result = await fake.service.commitReplace(prepared, (item) => {
      if (item.stage === 'promotion' || item.stage === 'commit') {
        progress.push(`${item.stage}:${item.completed}/${item.total}`)
      }
    })

    expect(result).toEqual({ insertedCount: 5, updatedCount: 7, replacedCount: 9 })
    expect(fake.events).toEqual([
      'invoke:list_replace_media_promotion',
      'invoke:promote_replace_media',
      'invoke:commit_replace_all',
    ])
    expect(fake.invoke.mock.calls.find((call) => call[1].body.action === 'promote_replace_media')?.[1].body.path)
      .toBe('media/pending.webp')
    expect(progress).toEqual([
      'promotion:0/1',
      'promotion:1/1',
      'commit:0/1',
      'commit:1/1',
    ])
  })

  it('never calls the destructive commit if an incoming media promotion fails', async () => {
    const fake = fakeEnvironment()
    const prepared = await fake.service.prepareSafety(fake.replaceReady)
    fake.events.length = 0
    fake.invoke.mockImplementation(async (_name: string, options: { body: Record<string, unknown> }) => {
      const action = String(options.body.action)
      fake.events.push(`invoke:${action}`)
      if (action === 'list_replace_media_promotion') {
        return { data: { media: [{ path: 'media/pending.webp', promoted: false }] }, error: null }
      }
      if (action === 'promote_replace_media') return { data: null, error: { message: 'promotion failed' } }
      return { data: { result: {} }, error: null }
    })

    await expect(fake.service.commitReplace(prepared)).rejects.toThrow('Replace restore request failed')
    expect(fake.events).toEqual([
      'invoke:list_replace_media_promotion',
      'invoke:promote_replace_media',
    ])
  })
})
