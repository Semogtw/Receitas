import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fakes = vi.hoisted(() => ({
  exportPortableBackup: vi.fn(),
}))

vi.mock('../data/portable-backup-exporter', () => ({
  exportPortableBackup: fakes.exportPortableBackup,
}))

import { BackupPanel } from './BackupPanel'

const backup = {
  format: 'receitas-portable-backup' as const,
  version: 1 as const,
  scope: 'active-shared-data' as const,
  exportedAt: '2026-08-07T22:03:04.000Z',
  sourcePairId: 'pair-a',
  categories: [{ id: 'category-a', name: 'Sobremesas' }],
  conversionProfiles: [],
  recipes: [],
}

describe('BackupPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fakes.exportPortableBackup.mockResolvedValue(backup)
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 'blob:backup'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => undefined),
    })
  })

  afterEach(() => vi.restoreAllMocks())

  it('exports a validated backup through an explicit user action', async () => {
    const user = userEvent.setup()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    render(<BackupPanel database={{} as never} pairId="pair-a" actorUserId="user-a" />)

    await user.click(screen.getByRole('button', { name: 'Exportar backup' }))

    await waitFor(() => expect(fakes.exportPortableBackup).toHaveBeenCalledWith(
      expect.anything(),
      { pairId: 'pair-a', actorUserId: 'user-a' },
    ))
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(click).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:backup')
  })

  it('previews counts and warnings for a same-pair archive without applying writes', async () => {
    const user = userEvent.setup()
    render(<BackupPanel database={{} as never} pairId="pair-a" actorUserId="user-a" />)
    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' })

    await user.upload(screen.getByLabelText('Arquivo de backup'), file)

    expect(await screen.findByText('Backup válido para este par')).toBeInTheDocument()
    expect(screen.getByText('1 categoria')).toBeInTheDocument()
    expect(screen.getByText(/binários das fotos/i)).toBeInTheDocument()
    expect(screen.getByText(/prévia não altera o banco/i)).toBeInTheDocument()
  })

  it('blocks a backup from another pair before any restore action is available', async () => {
    const user = userEvent.setup()
    render(<BackupPanel database={{} as never} pairId="pair-b" actorUserId="user-b" />)
    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' })

    await user.upload(screen.getByLabelText('Arquivo de backup'), file)

    expect(await screen.findByText('Backup bloqueado')).toBeInTheDocument()
    expect(screen.getByText(/outro par/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Restaurar/i })).not.toBeInTheDocument()
  })
})
