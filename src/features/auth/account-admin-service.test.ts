import type { PowerSyncDatabase } from '@powersync/web'
import { describe, expect, it, vi } from 'vitest'
import type { BackupArtifact } from '../backup/domain/complete-backup-format'
import type { RestoreJobSummary } from '../backup/data/restore-staging-service'
import { AccountAdminService } from './account-admin-service'

const pairId = '20000000-0000-4000-8000-000000000002'
const actorUserId = '10000000-0000-4000-8000-000000000001'
const safetyJobId = '30000000-0000-4000-8000-000000000003'

function artifact(): BackupArtifact {
  const file = new File(['safe'], 'safety.zip', { type: 'application/zip' })
  return {
    manifest: {
      format: 'receitas-backup',
      version: 1,
      createdAt: '2026-08-09T10:00:00.000Z',
      appVersion: '1.0.0',
      pairExportId: 'safety-export',
      dataFiles: [],
      mediaFiles: [],
    },
    filename: file.name,
    bytes: file.size,
    sha256: 'a'.repeat(64),
    file,
  }
}

function safetyJob(): RestoreJobSummary {
  return {
    id: safetyJobId,
    pairId,
    mode: 'merge',
    status: 'ready_to_commit',
    manifestSha256: 'b'.repeat(64),
    safetyBackupId: null,
    expiresAt: '2026-08-10T10:00:00.000Z',
  }
}

function fakeEnvironment() {
  const calls: string[] = []
  const backupFactory = vi.fn(async () => {
    calls.push('backup')
    return artifact()
  })
  const staging = {
    stageArchive: vi.fn(async (file: Blob, mode: 'merge' | 'replace_all') => {
      expect(file).toBeInstanceOf(Blob)
      calls.push(`stage:${mode}`)
      return safetyJob()
    }),
  }
  const signInWithPassword = vi.fn(async () => {
    calls.push('reauth')
    return { data: { user: { id: actorUserId }, session: {} }, error: null }
  })
  const invoke = vi.fn(async (_name: string, options: { body: Record<string, unknown> }) => {
    calls.push(`invoke:${String(options.body.action)}`)
    if (options.body.action === 'status') {
      return {
        data: {
          status: {
            otherMember: { userId: '10000000-0000-4000-8000-000000000002', email: 'other@example.com' },
            replacementAvailable: true,
            pendingReplacement: null,
            authCleanupPending: false,
          },
        },
        error: null,
      }
    }
    return { data: { ok: true, authCleanupPending: false }, error: null }
  })
  const service = new AccountAdminService(
    {
      auth: { signInWithPassword },
      functions: { invoke },
      storage: { from: vi.fn() },
    } as never,
    {} as PowerSyncDatabase,
    pairId,
    actorUserId,
    '1.0.0',
    { download: vi.fn() },
    { backupFactory: backupFactory as never, staging },
  )
  return { service, backupFactory, staging, signInWithPassword, invoke, calls }
}

describe('AccountAdminService', () => {
  it('creates and stages the exact safety artifact before any destructive account call', async () => {
    const fake = fakeEnvironment()

    const safety = await fake.service.prepareSafety()

    expect(safety.artifact.filename).toBe('safety.zip')
    expect(safety.job.id).toBe(safetyJobId)
    expect(fake.calls).toEqual(['backup', 'stage:merge'])
    expect(fake.invoke).not.toHaveBeenCalled()
  })

  it('reauthenticates with current password before removing the other identity', async () => {
    const fake = fakeEnvironment()
    const safety = { artifact: artifact(), job: safetyJob() }

    await fake.service.removeOther({ safety, currentEmail: 'me@example.com', password: 'current-password' })

    expect(fake.calls).toEqual(['reauth', 'invoke:remove_other'])
    expect(fake.signInWithPassword).toHaveBeenCalledWith({
      email: 'me@example.com',
      password: 'current-password',
    })
    expect(fake.invoke.mock.calls[0]?.[1].body).toEqual({
      action: 'remove_other',
      safetyJobId,
    })
  })

  it('never sends the password to the account-admin Edge Function', async () => {
    const fake = fakeEnvironment()
    const safety = { artifact: artifact(), job: safetyJob() }

    await fake.service.beginReplacement({
      safety,
      currentEmail: 'me@example.com',
      password: 'very-private-password',
      replacementEmail: 'new@example.com',
    })

    const body = fake.invoke.mock.calls[0]?.[1].body
    expect(body).toEqual({
      action: 'begin_replacement',
      safetyJobId,
      replacementEmail: 'new@example.com',
    })
    expect(JSON.stringify(body)).not.toContain('very-private-password')
  })

  it('stops before the destructive Edge call when password reauthentication fails', async () => {
    const fake = fakeEnvironment()
    fake.signInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'bad credentials' },
    })

    await expect(fake.service.removeOther({
      safety: { artifact: artifact(), job: safetyJob() },
      currentEmail: 'me@example.com',
      password: 'wrong',
    })).rejects.toThrow('Recent password authentication failed')

    expect(fake.invoke).not.toHaveBeenCalled()
  })

  it('loads only the server-derived other member and recovery capability', async () => {
    const fake = fakeEnvironment()

    const status = await fake.service.status()

    expect(status.otherMember).toEqual({
      userId: '10000000-0000-4000-8000-000000000002',
      email: 'other@example.com',
    })
    expect(status.replacementAvailable).toBe(true)
    expect(status.pendingReplacement).toBeNull()
    expect(status.authCleanupPending).toBe(false)
  })
})
