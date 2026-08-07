import { sha256Hex } from '../../lib/crypto'
import { getSupabaseClient } from '../../lib/supabase/client'

export type InviteKind = 'bootstrap' | 'pair'

export async function completeInvitation(input: {
  kind: InviteKind
  password: string
  pairInviteToken?: string | null
}): Promise<void> {
  if (input.password.length < 12) throw new Error('A senha precisa ter pelo menos 12 caracteres.')
  if (input.kind === 'pair' && !input.pairInviteToken) throw new Error('O vínculo do convite está ausente. Peça um novo convite.')

  const supabase = getSupabaseClient()
  const { error: passwordError } = await supabase.auth.updateUser({ password: input.password })
  if (passwordError) throw passwordError

  if (input.kind === 'bootstrap') {
    const { error } = await supabase.rpc('activate_current_pair_membership')
    if (error) throw error
    return
  }

  const inviteTokenHash = await sha256Hex(input.pairInviteToken!)
  const { error } = await supabase.rpc('accept_pair_invite', { invite_token_hash: inviteTokenHash })
  if (error) throw error
}
