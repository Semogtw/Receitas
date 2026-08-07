import { normalizeEmail } from '../_shared/crypto.ts'

export interface PairInviteDependencies {
  getActivePair(userId: string): Promise<string>
  revokePending(pairId: string, creatorUserId: string): Promise<string[]>
  deleteUser(userId: string): Promise<void>
  createNonceHash(): Promise<string>
  inviteUser(email: string, redirectTo: string): Promise<string>
  reserveInvite(input: {
    pairId: string
    creatorUserId: string
    invitedUserId: string
    tokenHash: string
    expiresAt: string
  }): Promise<void>
  appBaseUrl: string
  inviteTtlSeconds: number
}

export class PairInvitePublicError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export async function runPairInvite(
  body: Record<string, unknown>,
  creatorUserId: string,
  deps: PairInviteDependencies,
): Promise<{ expiresInSeconds: number }> {
  const email = normalizeEmail(body.email)
  if (!email) throw new PairInvitePublicError(400, 'invalid_request', 'Informe um e-mail válido.')

  let pairId: string
  try {
    pairId = await deps.getActivePair(creatorUserId)
  } catch {
    throw new PairInvitePublicError(403, 'active_pair_required', 'Membro ativo do par obrigatório.')
  }

  const replacedUserIds = await deps.revokePending(pairId, creatorUserId)
  for (const replacedUserId of replacedUserIds) {
    try {
      await deps.deleteUser(replacedUserId)
    } catch {
      throw new PairInvitePublicError(503, 'cleanup_failed', 'Não foi possível substituir o convite anterior agora.')
    }
  }

  const redirect = new URL('/auth/finish-invite', deps.appBaseUrl)
  redirect.searchParams.set('kind', 'pair')
  const tokenHash = await deps.createNonceHash()

  let invitedUserId: string
  try {
    invitedUserId = await deps.inviteUser(email, redirect.toString())
  } catch {
    throw new PairInvitePublicError(400, 'invite_failed', 'Não foi possível enviar o convite.')
  }

  const expiresAt = new Date(Date.now() + deps.inviteTtlSeconds * 1000).toISOString()
  try {
    await deps.reserveInvite({ pairId, creatorUserId, invitedUserId, tokenHash, expiresAt })
  } catch {
    try { await deps.deleteUser(invitedUserId) } catch { /* no product authorization was committed */ }
    throw new PairInvitePublicError(409, 'seat_unavailable', 'A segunda vaga não está mais disponível.')
  }

  return { expiresInSeconds: deps.inviteTtlSeconds }
}
