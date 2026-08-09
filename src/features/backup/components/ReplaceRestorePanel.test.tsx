import type { PowerSyncDatabase } from '@powersync/web'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { BackupArtifact } from '../domain/complete-backup-format'
import type { RestoreReplaceService, ReplacePreparation } from '../data/restore-replace-service'
import type { RestoreJobSummary } from '../data/restore-staging-service'
import { ReplaceRestorePanel } from './ReplaceRestorePanel'

const pairId = '20000000-0000-4000-8000-000000000002'
const actorUserId = '10000000-0000-4000-8000-000000000001'
const replaceJobId = '30000000-0000-4000-8000-000000000003'
const safetyJobId = '30000000-0000-4000-8000-000000000004'
const database = {} as PowerSyncDatabase

function restoreJob(overrides: Partial<RestoreJobSummary> = {}): RestoreJobSummary {
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
      pairExportId: 'safety-export',
      dataFiles: [],
      mediaFiles: [],
    },
    filename: file.name,
    bytes: file.size,
    sha256: 'b'.repeat(64),
    file,
  }
}

function fakeService() {
  const replaceJob = restoreJob()
  const safetyJob = restoreJob({ id: safetyJobId, mode: 'merge' })
  const preparation: ReplacePreparation = {
    replaceJob: restoreJob({ safetyBackupId: safetyJobId }),
    safetyJob,
    safetyArtifact: safetyArtifact(),
  }
  return {
    replaceJob,
    preparation,
    service: {
      stageIncoming: vi.fn(async () => replaceJob),
      prepareSafety: vi.fn(async () => preparation),
      commitReplace: vi.fn(async () => ({ insertedCount: 3, updatedCount: 4, replacedCount: 8 })),
    } as unknown as RestoreReplaceService,
  }
}

function renderPanel(service: RestoreReplaceService) {
  render(
    <ReplaceRestorePanel
      database={database}
      pairId={pairId}
      actorUserId={actorUserId}
      appVersion="1.0.0"
      service={service}
    />,
  )
}

describe('ReplaceRestorePanel', () => {
  it('does not expose safety or destructive confirmation before incoming preflight finishes', async () => {
    const user = userEvent.setup()
    const fake = fakeService()
    renderPanel(fake.service)

    expect(screen.queryByRole('button', { name: /Gerar e validar backup de segurança/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Substituir tudo agora/ })).toBeNull()

    const file = new File(['incoming'], 'incoming.zip', { type: 'application/zip' })
    await user.upload(screen.getByLabelText('Backup que substituirá o estado atual'), file)
    await user.click(screen.getByRole('button', { name: '1. Validar backup recebido' }))

    expect(fake.service.stageIncoming).toHaveBeenCalledWith(file, expect.any(Function))
    expect(await screen.findByRole('button', { name: '2. Gerar e validar backup de segurança' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Substituir tudo agora/ })).toBeNull()
  })

  it('shows the exact safety artifact and only then exposes the destructive commit', async () => {
    const user = userEvent.setup()
    const fake = fakeService()
    renderPanel(fake.service)

    const file = new File(['incoming'], 'incoming.zip', { type: 'application/zip' })
    await user.upload(screen.getByLabelText('Backup que substituirá o estado atual'), file)
    await user.click(screen.getByRole('button', { name: '1. Validar backup recebido' }))
    await user.click(await screen.findByRole('button', { name: '2. Gerar e validar backup de segurança' }))

    expect(fake.service.prepareSafety).toHaveBeenCalledWith(fake.replaceJob, expect.any(Function))
    expect(await screen.findByRole('button', { name: `Baixar ${fake.preparation.safetyArtifact.filename}` })).toBeTruthy()
    expect(screen.getByRole('button', { name: '3. Substituir tudo agora' })).toBeTruthy()
    expect(fake.service.commitReplace).not.toHaveBeenCalled()
  })

  it('downloads the same safety file returned by the preparation service', async () => {
    const user = userEvent.setup()
    const fake = fakeService()
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:safety')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    renderPanel(fake.service)

    const file = new File(['incoming'], 'incoming.zip', { type: 'application/zip' })
    await user.upload(screen.getByLabelText('Backup que substituirá o estado atual'), file)
    await user.click(screen.getByRole('button', { name: '1. Validar backup recebido' }))
    await user.click(await screen.findByRole('button', { name: '2. Gerar e validar backup de segurança' }))
    await user.click(await screen.findByRole('button', { name: `Baixar ${fake.preparation.safetyArtifact.filename}` }))

    expect(createObjectURL).toHaveBeenCalledWith(fake.preparation.safetyArtifact.file)
    expect(click).toHaveBeenCalledTimes(1)

    createObjectURL.mockRestore()
    revokeObjectURL.mockRestore()
    click.mockRestore()
  })

  it('only calls the destructive commit from the explicit third-step button', async () => {
    const user = userEvent.setup()
    const fake = fakeService()
    renderPanel(fake.service)

    const file = new File(['incoming'], 'incoming.zip', { type: 'application/zip' })
    await user.upload(screen.getByLabelText('Backup que substituirá o estado atual'), file)
    await user.click(screen.getByRole('button', { name: '1. Validar backup recebido' }))
    await user.click(await screen.findByRole('button', { name: '2. Gerar e validar backup de segurança' }))
    expect(fake.service.commitReplace).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '3. Substituir tudo agora' }))

    expect(fake.service.commitReplace).toHaveBeenCalledWith(fake.preparation, expect.any(Function))
    expect(await screen.findByText('Substituição concluída.')).toBeTruthy()
    expect(screen.getByText('3 registros novos · 4 registros reaplicados')).toBeTruthy()
  })

  it('keeps the destructive step unavailable when safety generation fails', async () => {
    const user = userEvent.setup()
    const fake = fakeService()
    vi.mocked(fake.service.prepareSafety).mockRejectedValueOnce(new Error('safety failed'))
    renderPanel(fake.service)

    const file = new File(['incoming'], 'incoming.zip', { type: 'application/zip' })
    await user.upload(screen.getByLabelText('Backup que substituirá o estado atual'), file)
    await user.click(screen.getByRole('button', { name: '1. Validar backup recebido' }))
    await user.click(await screen.findByRole('button', { name: '2. Gerar e validar backup de segurança' }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '3. Substituir tudo agora' })).toBeNull()
    expect(fake.service.commitReplace).not.toHaveBeenCalled()
  })
})
