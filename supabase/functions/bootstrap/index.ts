import { constantTimeSecretEquals } from '../_shared/crypto.ts'
import { jsonResponse, preflightResponse, readJsonObject, requestOriginAllowed } from '../_shared/http.ts'
import { getAdminClient, getAppBaseUrl, getBootstrapSecret } from '../_shared/server.ts'
import { BootstrapPublicError, runBootstrap } from './service.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return preflightResponse(request)
  if (request.method !== 'POST') return jsonResponse(request, { error: 'Método não permitido.' }, 405)
  if (!requestOriginAllowed(request)) return jsonResponse(request, { error: 'Origin não permitida.' }, 403)

  try {
    const body = await readJsonObject(request)
    const admin = getAdminClient()

    const result = await runBootstrap(body, {
      appBaseUrl: getAppBaseUrl(),
      verifySecret: (provided) => constantTimeSecretEquals(provided, getBootstrapSecret()),
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

    return jsonResponse(request, { ok: true, ...result }, 201)
  } catch (error) {
    if (error instanceof BootstrapPublicError) {
      return jsonResponse(request, { error: error.message, code: error.code }, error.status)
    }
    if (error instanceof SyntaxError || (error instanceof Error && error.message === 'invalid_json_object')) {
      return jsonResponse(request, { error: 'Corpo JSON inválido.', code: 'invalid_json' }, 400)
    }

    console.error('bootstrap_internal_error', error instanceof Error ? error.message : 'unknown')
    return jsonResponse(request, { error: 'Falha interna ao iniciar o aplicativo.', code: 'internal_error' }, 500)
  }
})
