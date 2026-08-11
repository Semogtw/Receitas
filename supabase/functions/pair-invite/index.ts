import { randomOpaqueToken, sha256Hex } from '../_shared/crypto.ts'
import { jsonResponse, preflightResponse, readJsonObject, requestOriginAllowed, safeErrorClass } from '../_shared/http.ts'
import { getAdminClient, getAppBaseUrl, getRequestUserId } from '../_shared/server.ts'
import { PairInvitePublicError, runPairInvite } from './service.ts'

const INVITE_TTL_SECONDS = 86400

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return preflightResponse(request)
  if (request.method !== 'POST') return jsonResponse(request, { error: 'Método não permitido.' }, 405)
  if (!requestOriginAllowed(request)) return jsonResponse(request, { error: 'Origin não permitida.' }, 403)

  try {
    const creatorUserId = await getRequestUserId(request)
    const body = await readJsonObject(request)
    const admin = getAdminClient()

    const result = await runPairInvite(body, creatorUserId, {
      appBaseUrl: getAppBaseUrl(),
      inviteTtlSeconds: INVITE_TTL_SECONDS,
      getActivePair: async (userId) => {
        const { data, error } = await admin
          .from('pair_members')
          .select('pair_id, activated_at, removed_at')
          .eq('user_id', userId)
          .is('removed_at', null)
          .single()

        if (error || !data?.pair_id || !data.activated_at) throw error ?? new Error('inactive_member')
        return data.pair_id as string
      },
      revokePending: async (pairId, creatorUserId) => {
        const { error } = await admin.rpc('revoke_pending_pair_invite', {
          target_pair_id: pairId,
          creator_user_id: creatorUserId,
        })
        if (error) throw error

        const { data: orphanedInvites, error: orphanError } = await admin
          .from('pair_invites')
          .select('invited_user_id')
          .eq('pair_id', pairId)
          .is('consumed_at', null)
          .not('invalidated_at', 'is', null)
          .not('invited_user_id', 'is', null)

        if (orphanError) throw orphanError
        return Array.from(new Set(
          (orphanedInvites ?? [])
            .map((row) => row.invited_user_id as string | null)
            .filter((value): value is string => Boolean(value)),
        ))
      },
      deleteUser: async (userId) => {
        const { error } = await admin.auth.admin.deleteUser(userId)
        if (error) throw error
      },
      createNonceHash: async () => sha256Hex(randomOpaqueToken(32)),
      inviteUser: async (email, redirectTo) => {
        const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })
        if (error || !data.user) throw error ?? new Error('missing_invited_user')
        return data.user.id
      },
      reserveInvite: async ({ pairId, creatorUserId, invitedUserId, tokenHash, expiresAt }) => {
        const { error } = await admin.rpc('reserve_pair_invite', {
          target_pair_id: pairId,
          creator_user_id: creatorUserId,
          invited_user_id: invitedUserId,
          invite_token_hash: tokenHash,
          invite_expires_at: expiresAt,
        })
        if (error) throw error
      },
    })

    return jsonResponse(request, { ok: true, ...result }, 201)
  } catch (error) {
    if (error instanceof PairInvitePublicError) {
      return jsonResponse(request, { error: error.message, code: error.code }, error.status)
    }
    if (error instanceof Error && error.message === 'authentication_required') {
      return jsonResponse(request, { error: 'Autenticação obrigatória.', code: 'authentication_required' }, 401)
    }
    if (error instanceof Error && error.message === 'request_body_too_large') {
      return jsonResponse(request, { error: 'Corpo da requisição muito grande.', code: 'request_body_too_large' }, 413)
    }
    if (error instanceof SyntaxError || (error instanceof Error && error.message === 'invalid_json_object')) {
      return jsonResponse(request, { error: 'Corpo JSON inválido.', code: 'invalid_json' }, 400)
    }

    console.error('pair_invite_internal_error', safeErrorClass(error))
    return jsonResponse(request, { error: 'Falha interna ao criar convite.', code: 'internal_error' }, 500)
  }
})
