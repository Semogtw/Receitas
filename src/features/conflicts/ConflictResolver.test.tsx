import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConflictResolver } from './ConflictResolver'
import type { ParsedConflict } from '../../data/conflicts/types'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../lib/supabase/client', () => ({ getSupabaseClient: () => ({ rpc }) }))

const conflict: ParsedConflict = {
  id: '30000000-0000-4000-8000-000000000003',
  pair_id: '20000000-0000-4000-8000-000000000002',
  entity_type: 'recipes',
  entity_id: '40000000-0000-4000-8000-000000000004',
  base_revision: 2,
  status: 'open',
  resolution_strategy: null,
  resolved_by: null,
  created_at: '2026-08-07T21:00:00.000Z',
  resolved_at: null,
  base: { pair_id: 'pair', revision: 2, title: 'Bolo', favorite: 0 },
  local: { pair_id: 'pair', revision: 2, title: 'Bolo local', favorite: 0 },
  remote: { pair_id: 'pair', revision: 3, title: 'Bolo remoto', favorite: 1 },
  resolution: null,
}

describe('ConflictResolver', () => {
  beforeEach(() => rpc.mockReset().mockResolvedValue({ data: [{ result_status: 'resolved', resulting_revision: 4 }], error: null }))

  it('defaults field-level merge choices to the stable remote values', () => {
    render(<ConflictResolver conflict={conflict} />)
    expect(screen.getByRole('radio', { name: /remoto/i, checked: true })).toBeInTheDocument()
  })

  it('sends an explicit merged payload only after the user chooses fields', async () => {
    const user = userEvent.setup()
    render(<ConflictResolver conflict={conflict} />)
    const localChoices = screen.getAllByRole('radio', { name: /local/i })
    await user.click(localChoices.find((input) => input.closest('fieldset')?.textContent?.includes('Título'))!)
    await user.click(screen.getByRole('button', { name: 'Mesclar escolhas' }))

    expect(rpc).toHaveBeenCalledWith('resolve_conflict', expect.objectContaining({
      p_conflict_id: conflict.id,
      p_strategy: 'merge',
      p_resolution_payload: expect.objectContaining({ title: 'Bolo local', favorite: 1 }),
    }))
  })

  it('keeps the resolver open when the server refreshes a newer remote version', async () => {
    rpc.mockResolvedValue({ data: [{ result_status: 'refreshed', resulting_revision: 5 }], error: null })
    const refreshed = vi.fn()
    const user = userEvent.setup()
    render(<ConflictResolver conflict={conflict} onRefreshed={refreshed} />)
    await user.click(screen.getByRole('button', { name: 'Usar versão remota' }))
    expect(await screen.findByText(/versão remota mudou/i)).toBeInTheDocument()
    expect(refreshed).toHaveBeenCalled()
  })

  it('only offers the safe remote option for an unexpected create collision', () => {
    render(<ConflictResolver conflict={{ ...conflict, base: null }} />)
    expect(screen.queryByRole('button', { name: 'Usar versão local' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mesclar escolhas' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Usar versão remota' })).toBeInTheDocument()
  })
})
