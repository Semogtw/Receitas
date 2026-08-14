import { constantTimeSecretEquals } from '../_shared/crypto.ts'
import { jsonResponse, preflightResponse, readJsonObject, requestOriginAllowed, safeErrorClass } from '../_shared/http.ts'
import { getAdminClient, getAppBaseUrl, getBootstrapSecret } from '../_shared/server.ts'
import { BootstrapPublicError, runBootstrap, runBootstrapReinvite } from './service.ts'

function bootstrapSecretMatches(provided: string): Promise<boolean> {
  return constantTimeSecretEquals(provided, getBootstrapSecret())
}

export function createBootstrapHandler() {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return preflightResponse(request)
    if (request.method !== 'POST') return jsonResponse(request, { error: 'Método não permitido.' }, 405)
    if (!requestOriginAllowed(request)) return jsonResponse(request, { error: 'Origin não permitida.' }, 403)

    try {
      // Parse the bounded request before creating the service-role client. This
      // keeps malformed/oversized public traffic on the cheapest fail-closed path.
      const body = await readJsonObject(request)
      const admin = getAdminClient()
      const action = body.action === 'reinvite' ? 'reinvite' : 'start'

      const result = action === 'reinvite'
        ? await runBootstrapReinvite(body, {
          appBaseUrl: getAppBaseUrl(),
          verifySecret: bootstrapSecretMatches,
          begin: async (email) => {
            const { data, error } = await admin.rpc('begin_bootstrap_reinvite', { target_email: email })
            if (error) throw error
            const row = Array.isArray(data) ? data[0] : data
            if (!row?.attempt_id || !row?.old_user_id) throw new Error('missing_reinvite_state')
            return { attemptId: row.attempt_id as string, oldUserId: row.old_user_id as string }
          },
          findAuthUser: async (email) => {
            const { data, error } = await admin.rpc('find_auth_user_by_email', { target_email: email })
            if (error) throw error
            return typeof data === 'string' ? data : null
          },
          deleteUser: async (userId) => {
            const { error } = await admin.auth.admin.deleteUser(userId)
            if (error) throw error
          },
          inviteUser: async (email, redirectTo) => {
            const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })
            if (error || !data.user) throw error ?? new Error('missing_invited_user')
            return data.user.id
          },
          finish: async (attemptId, newUserId) => {
            const { error } = await admin.rpc('finish_bootstrap_reinvite', {
              target_attempt_id: attemptId,
              new_user_id: newUserId,
            })
            if (error) throw error
          },
          abort: async (attemptId) => {
            const { error } = await admin.rpc('abort_bootstrap_reinvite', { target_attempt_id: attemptId })
            if (error) throw error
          },
        })
        : await runBootstrap(body, {
          appBaseUrl: getAppBaseUrl(),
          verifySecret: bootstrapSecretMatches,
          isAvailable: async () => {
            const { data, error } = await admin.rpc('bootstrap_is_available')
            if (error) throw error
            return data === true
          },
          inviteUser: async (email, redirectTo) => {
            const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })
            if (error || !data.user) throw error ?? new Error('missing_invited_user')
            return data.user.id
          },
          createPair: async (userId) => {
            const { error } = await admin.rpc('create_bootstrap_pair', { invited_user_id: userId })
            if (error) throw error
          },
          deleteUser: async (userId) => {
            const { error } = await admin.auth.admin.deleteUser(userId)
            if (error) throw error
          },
        })

      return jsonResponse(request, { ok: true, action, ...result }, action === 'start' ? 201 : 200)
    } catch (error) {
      if (error instanceof BootstrapPublicError) {
        return jsonResponse(request, { error: error.message, code: error.code }, error.status)
      }
      if (error instanceof Error && error.message === 'request_body_too_large') {
        return jsonResponse(request, { error: 'Corpo da requisição muito grande.', code: 'request_body_too_large' }, 413)
      }
      if (error instanceof SyntaxError || (error instanceof Error && error.message === 'invalid_json_object')) {
        return jsonResponse(request, { error: 'Corpo JSON inválido.', code: 'invalid_json' }, 400)
      }

      console.error('bootstrap_internal_error', safeErrorClass(error))
      return jsonResponse(request, { error: 'Falha interna ao iniciar o aplicativo.', code: 'internal_error' }, 500)
    }
  }
}

if (import.meta.main) Deno.serve(createBootstrapHandler())
