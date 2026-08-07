import { beforeEach, describe, expect, it, vi } from 'vitest'
import { completeInvitation } from './invite-completion'

const updateUser = vi.hoisted(() => vi.fn())
const rpc = vi.hoisted(() => vi.fn())

vi.mock('../../lib/supabase/client', () => ({
  getSupabaseClient: () => ({ auth: { updateUser }, rpc }),
}))

describe('completeInvitation', () => {
  beforeEach(() => {
    updateUser.mockReset().mockResolvedValue({ error: null })
    rpc.mockReset().mockResolvedValue({ error: null })
  })

  it('rejects weak passwords before touching Supabase', async () => {
    await expect(completeInvitation({ kind: 'pair', password: 'curta' })).rejects.toThrow('12 caracteres')
    expect(updateUser).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('sets the password before activating bootstrap membership', async () => {
    await completeInvitation({ kind: 'bootstrap', password: 'uma-senha-forte-123' })
    expect(updateUser).toHaveBeenCalledWith({ password: 'uma-senha-forte-123' })
    expect(rpc).toHaveBeenCalledWith('activate_current_pair_membership')
    expect(updateUser.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[0])
  })

  it('accepts the reserved pair membership without sending a browser credential', async () => {
    await completeInvitation({ kind: 'pair', password: 'uma-senha-forte-123' })
    expect(rpc).toHaveBeenCalledWith('accept_pair_invite')
    expect(rpc.mock.calls[0]).toHaveLength(1)
  })
})
