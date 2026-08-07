import { getSupabaseClient } from '../../lib/supabase/client'

export type InviteKind = 'bootstrap' | 'pair'

export async function completeInvitation(input: {
  kind: InviteKind
  password: string
}): Promise<void> {
  if (input.password.length < 12) throw new Error('A senha precisa ter pelo menos 12 caracteres.')

  const supabase = getSupabaseClient()
  const { error: passwordError } = await supabase.auth.updateUser({ password: input.password })
  if (passwordError) throw passwordError

  const { error } = input.kind === 'bootstrap'
    ? await supabase.rpc('activate_current_pair_membership')
    : await supabase.rpc('accept_pair_invite')

  if (error) throw error
}
