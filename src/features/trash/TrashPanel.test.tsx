import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TrashEntry } from './trash-repository'
import { TrashPanel } from './TrashPanel'

const ENTRY: TrashEntry = {
  entityType: 'recipes',
  entityId: '40000000-0000-4000-8000-000000000004',
  label: 'Bolo antigo',
  deletedAt: '2026-08-10T05:00:00.000Z',
  updatedAt: '2026-08-10T05:00:00.000Z',
}

function databaseStub() {
  return {
    registerListener: vi.fn(() => vi.fn()),
  } as never
}

describe('TrashPanel', () => {
  it('restores a deleted item through the injected repository', async () => {
    const user = userEvent.setup()
    let entries = [ENTRY]
    const repository = {
      listTrash: vi.fn(async () => entries),
      restore: vi.fn(async () => { entries = [] }),
      permanentlyDelete: vi.fn(),
      retryPendingMediaCleanup: vi.fn(async () => ({ cleanupPending: false })),
    }

    render(
      <TrashPanel
        database={databaseStub()}
        pairId="pair-a"
        actorUserId="user-a"
        repository={repository}
      />,
    )

    expect(await screen.findByText('Bolo antigo')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Restaurar' }))
    await waitFor(() => expect(repository.restore).toHaveBeenCalledWith('recipes', ENTRY.entityId))
    expect(await screen.findByText(/Item restaurado/)).toBeInTheDocument()
    expect(screen.queryByText('Bolo antigo')).not.toBeInTheDocument()
  })

  it('requires a second explicit confirmation before permanent deletion', async () => {
    const user = userEvent.setup()
    let entries = [ENTRY]
    const repository = {
      listTrash: vi.fn(async () => entries),
      restore: vi.fn(),
      permanentlyDelete: vi.fn(async () => { entries = [] }),
      retryPendingMediaCleanup: vi.fn(async () => ({ cleanupPending: false })),
    }

    render(
      <TrashPanel
        database={databaseStub()}
        pairId="pair-a"
        actorUserId="user-a"
        repository={repository}
      />,
    )

    await screen.findByText('Bolo antigo')
    await user.click(screen.getByRole('button', { name: 'Excluir definitivamente' }))
    expect(repository.permanentlyDelete).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Bolo antigo')

    await user.click(dialog.getByRole('button', { name: 'Excluir definitivamente' }))
    await waitFor(() => expect(repository.permanentlyDelete).toHaveBeenCalledWith('recipes', ENTRY.entityId))
    expect(await screen.findByText(/Exclusão definitiva concluída/)).toBeInTheDocument()
  })

  it('offers an explicit retry when server-side media cleanup may be pending', async () => {
    const user = userEvent.setup()
    const repository = {
      listTrash: vi.fn(async () => []),
      restore: vi.fn(),
      permanentlyDelete: vi.fn(),
      retryPendingMediaCleanup: vi.fn(async () => ({ cleanupPending: true })),
    }

    render(
      <TrashPanel
        database={databaseStub()}
        pairId="pair-a"
        actorUserId="user-a"
        repository={repository}
      />,
    )

    await screen.findByText('A lixeira está vazia neste dispositivo.')
    await user.click(screen.getByRole('button', { name: 'Repetir limpeza de arquivos' }))
    expect(await screen.findByText(/Ainda há arquivos remotos/)).toBeInTheDocument()
    expect(repository.retryPendingMediaCleanup).toHaveBeenCalledTimes(1)
  })
})
