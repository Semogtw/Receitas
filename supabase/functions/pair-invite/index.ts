import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.110.9'
import { randomOpaqueToken, sha256Hex } from '../_shared/crypto.ts'
import { jsonResponse, preflightResponse, readJsonObject, requestOriginAllowed, safeErrorClass } from '../_shared/http.ts'
import { getAdminClient, getAppBaseUrl, getRequestUserId } from '../_shared/server.ts'
import { PairInvitePublicError, runPairInvite } from './service.ts'

const INVITE_TTL_SECONDS = 86400

export interface PairInviteHandlerDependencies {
  getClient?: () => SupabaseClient
  getUserId?: (request: Request) => Promise<string>
  appBaseUrl?: () => string
  createNonceHash?: () => Promise<string>
}

export function createPairInviteHandler(dependencies: PairInviteHandlerDependencies = {}) {
  const getClient = dependencies.getClient ?? getAdminClient
  const getUserId = dependencies.getUserId ?? ((request: Request) => getRequestUserId(request))
  const appBaseUrl = dependencies.appBaseUrl ?? getAppBaseUrl
  const createNonceHash = dependencies.createNonceHash ?? (async () => sha256Hex(randomOpaqueToken(32)))

  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return preflightResponse(request)
    if (request.method !== 'POST') return jsonResponse(request, { error: 'Método não permitido.' }, 405)
    if (!requestOriginAllowed(request)) return jsonResponse(request, { error: 'Origin não permitida.' }, 403)

    try {
      // Bound and parse untrusted input before spending an authenticated-user
      // lookup or constructing the service-role client used by invite mutations.
      const body = await readJsonObject(request)
      const creatorUserId = await getUserId(request)
      const admin = getClient()

      const result = await runPairInvite(body, creatorUserId, {
        appBaseUrl: appBaseUrl(),
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
          const { data: revokedUserId, error } = await admin.rpc('revoke_pending_pair_invite', {
            target_pair_id: pairId,
            creator_user_id: creatorUserId,
          })
          if (error) throw error

          // The transaction returns the identity belonging to exactly the invite
          // it just invalidated. Never sweep historical invalidated invites: an
          // old UUID is not evidence that its current Auth identity is disposable.
          return typeof revokedUserId === 'string' && revokedUserId ? [revokedUserId] : []
        },
        deleteUser: async (userId) => {
          const { error } = await admin.auth.admin.deleteUser(userId)
          if (error) throw error
        },
        createNonceHash,
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
  }
}

if (import.meta.main) Deno.serve(createPairInviteHandler())
