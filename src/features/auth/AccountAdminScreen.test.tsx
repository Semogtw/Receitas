import type { PowerSyncDatabase } from '@powersync/web'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { BackupArtifact } from '../backup/domain/complete-backup-format'
import type { RestoreJobSummary } from '../backup/data/restore-staging-service'
import type { AccountAdminSafety, AccountAdminStatus, AccountAdminService } from './account-admin-service'
import { AccountAdminScreen } from './AccountAdminScreen'

const database = {} as PowerSyncDatabase
const pairId = '20000000-0000-4000-8000-000000000002'
const actorUserId = '10000000-0000-4000-8000-000000000001'

function artifact(): BackupArtifact {
  const file = new File(['safe'], 'account-safety.zip', { type: 'application/zip' })
  return {
    manifest: {
      format: 'receitas-backup',
      version: 1,
      createdAt: '2026-08-09T10:00:00.000Z',
      appVersion: '1.0.0',
      pairExportId: 'account-safety',
      dataFiles: [],
      mediaFiles: [],
    },
    filename: file.name,
    bytes: file.size,
    sha256: 'a'.repeat(64),
    file,
  }
}

function safety(): AccountAdminSafety {
  const job: RestoreJobSummary = {
    id: '30000000-0000-4000-8000-000000000003',
    pairId,
    mode: 'merge',
    status: 'ready_to_commit',
    manifestSha256: 'b'.repeat(64),
    safetyBackupId: null,
    expiresAt: '2026-08-10T10:00:00.000Z',
  }
  return { artifact: artifact(), job }
}

function status(overrides: Partial<AccountAdminStatus> = {}): AccountAdminStatus {
  return {
    otherMember: {
      userId: '10000000-0000-4000-8000-000000000002',
      email: 'other@example.com',
    },
    replacementAvailable: true,
    pendingReplacement: null,
    authCleanupPending: false,
    ...overrides,
  }
}

function fakeService(initialStatus = status()) {
  let currentStatus = initialStatus
  const prepared = safety()
  const service = {
    status: vi.fn(async () => currentStatus),
    prepareSafety: vi.fn(async () => prepared),
    removeOther: vi.fn(async () => {
      currentStatus = status({ otherMember: null, replacementAvailable: true })
    }),
    beginReplacement: vi.fn(async () => {
      currentStatus = status({
        otherMember: null,
        replacementAvailable: false,
        pendingReplacement: {
          actionId: '40000000-0000-4000-8000-000000000004',
          replacementUserId: '10000000-0000-4000-8000-000000000099',
          replacementEmail: 'new@example.com',
          expiresAt: '2026-08-10T10:00:00.000Z',
          authCleanupPending: false,
        },
      })
    }),
    cancelReplacement: vi.fn(async () => {
      currentStatus = status({ otherMember: null, replacementAvailable: true })
    }),
    retryAuthCleanup: vi.fn(async () => false),
  } as unknown as AccountAdminService
  return { service, prepared }
}

function renderScreen(service: AccountAdminService) {
  render(
    <AccountAdminScreen
      database={database}
      pairId={pairId}
      actorUserId={actorUserId}
      currentEmail="me@example.com"
      appVersion="1.0.0"
      service={service}
    />,
  )
}

async function openAdmin(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText('Recuperação excepcional de identidade'))
}

describe('AccountAdminScreen', () => {
  it('keeps destructive controls hidden until the safety backup is ready', async () => {
    const user = userEvent.setup()
    const fake = fakeService()
    renderScreen(fake.service)
    await openAdmin(user)

    expect(await screen.findByText('other@example.com')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Substituir identidade e enviar recuperação' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remover somente o acesso antigo' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Gerar e validar backup de segurança' }))

    expect(fake.service.prepareSafety).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('button', { name: `Baixar ${fake.prepared.artifact.filename}` })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Substituir identidade e enviar recuperação' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remover somente o acesso antigo' })).toBeTruthy()
  })

  it('passes the current password only to the service and clears the input after replacement starts', async () => {
    const user = userEvent.setup()
    const fake = fakeService()
    renderScreen(fake.service)
    await openAdmin(user)
    await screen.findByText('other@example.com')
    await user.click(screen.getByRole('button', { name: 'Gerar e validar backup de segurança' }))
    await user.type(screen.getByLabelText('Sua senha atual'), 'private-current-password')
    await user.type(screen.getByLabelText('Novo e-mail'), 'new@example.com')
    await user.click(screen.getByRole('button', { name: 'Substituir identidade e enviar recuperação' }))

    expect(fake.service.beginReplacement).toHaveBeenCalledWith({
      safety: fake.prepared,
      currentEmail: 'me@example.com',
      password: 'private-current-password',
      replacementEmail: 'new@example.com',
    })
    expect(await screen.findByText(/new@example.com/)).toBeTruthy()
    expect(screen.getByLabelText('Sua senha atual')).toHaveValue('')
  })

  it('allows later replacement after an administrative access-only removal without exposing the removed uuid', async () => {
    const user = userEvent.setup()
    const fake = fakeService(status({ otherMember: null, replacementAvailable: true }))
    renderScreen(fake.service)
    await openAdmin(user)

    expect(await screen.findByText(/vaga disponível apenas para recuperação administrativa/i)).toBeTruthy()
    expect(screen.queryByText('10000000-0000-4000-8000-000000000002')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Gerar e validar backup de segurança' }))

    expect(await screen.findByRole('button', { name: 'Substituir identidade e enviar recuperação' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remover somente o acesso antigo' })).toBeNull()
  })

  it('requires the current password to cancel a pending replacement', async () => {
    const user = userEvent.setup()
    const pendingStatus = status({
      otherMember: null,
      replacementAvailable: false,
      pendingReplacement: {
        actionId: '40000000-0000-4000-8000-000000000004',
        replacementUserId: '10000000-0000-4000-8000-000000000099',
        replacementEmail: 'new@example.com',
        expiresAt: '2026-08-10T10:00:00.000Z',
        authCleanupPending: false,
      },
    })
    const fake = fakeService(pendingStatus)
    renderScreen(fake.service)
    await openAdmin(user)

    const cancel = await screen.findByRole('button', { name: 'Cancelar recuperação pendente' })
    expect(cancel).toBeDisabled()
    await user.type(screen.getByLabelText('Sua senha atual'), 'current-password')
    expect(cancel).not.toBeDisabled()
    await user.click(cancel)

    expect(fake.service.cancelReplacement).toHaveBeenCalledWith({
      currentEmail: 'me@example.com',
      password: 'current-password',
    })
  })

  it('downloads exactly the safety artifact returned by the service', async () => {
    const user = userEvent.setup()
    const fake = fakeService()
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:safety')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    renderScreen(fake.service)
    await openAdmin(user)
    await screen.findByText('other@example.com')
    await user.click(screen.getByRole('button', { name: 'Gerar e validar backup de segurança' }))
    await user.click(await screen.findByRole('button', { name: `Baixar ${fake.prepared.artifact.filename}` }))

    expect(createObjectURL).toHaveBeenCalledWith(fake.prepared.artifact.file)
    expect(click).toHaveBeenCalledTimes(1)

    createObjectURL.mockRestore()
    revokeObjectURL.mockRestore()
    click.mockRestore()
  })
})
