import { beforeEach, describe, expect, it, vi } from 'vitest'
import { completeInvitation } from './invite-completion'

const updateUser = vi.hoisted(() => vi.fn())
const rpc = vi.hoisted(() => vi.fn())
const sha256Hex = vi.hoisted(() => vi.fn(async () => 'hashed-token'))

vi.mock('../../lib/supabase/client', () => ({
  getSupabaseClient: () => ({ auth: { updateUser }, rpc }),
}))
vi.mock('../../lib/crypto', () => ({ sha256Hex }))

describe('completeInvitation', () => {
  beforeEach(() => {
    updateUser.mockReset().mockResolvedValue({ error: null })
    rpc.mockReset().mockResolvedValue({ error: null })
    sha256Hex.mockClear()
  })

  it('validates the pair token before changing password', async () => {
    await expect(completeInvitation({ kind: 'pair', password: 'uma-senha-forte-123', pairInviteToken: null })).rejects.toThrow('vínculo')
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('sets the password before activating bootstrap membership', async () => {
    await completeInvitation({ kind: 'bootstrap', password: 'uma-senha-forte-123' })
    expect(updateUser).toHaveBeenCalledWith({ password: 'uma-senha-forte-123' })
    expect(rpc).toHaveBeenCalledWith('activate_current_pair_membership')
    expect(updateUser.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[0])
  })

  it('hashes the pair token locally and never sends its raw value to Postgres', async () => {
    await completeInvitation({ kind: 'pair', password: 'uma-senha-forte-123', pairInviteToken: 'raw-secret-token' })
    expect(sha256Hex).toHaveBeenCalledWith('raw-secret-token')
    expect(rpc).toHaveBeenCalledWith('accept_pair_invite', { invite_token_hash: 'hashed-token' })
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('raw-secret-token')
  })
})
