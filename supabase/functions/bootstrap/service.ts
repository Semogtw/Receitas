import { normalizeEmail } from '../_shared/crypto.ts'

export interface BootstrapDependencies {
  verifySecret(provided: string): Promise<boolean>
  isAvailable(): Promise<boolean>
  inviteUser(email: string, redirectTo: string): Promise<string>
  createPair(userId: string): Promise<void>
  deleteUser(userId: string): Promise<void>
  appBaseUrl: string
}

export interface BootstrapReinviteDependencies {
  verifySecret(provided: string): Promise<boolean>
  begin(email: string): Promise<{ attemptId: string; oldUserId: string }>
  findAuthUser(email: string): Promise<string | null>
  deleteUser(userId: string): Promise<void>
  inviteUser(email: string, redirectTo: string): Promise<string>
  finish(attemptId: string, newUserId: string): Promise<void>
  abort(attemptId: string): Promise<void>
  appBaseUrl: string
}

export class BootstrapPublicError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

function bootstrapInput(body: Record<string, unknown>): { email: string; providedSecret: string } {
  const email = normalizeEmail(body.email)
  const providedSecret = typeof body.bootstrapSecret === 'string' ? body.bootstrapSecret : ''

  if (!email) {
    throw new BootstrapPublicError(400, 'invalid_request', 'Informe um e-mail válido.')
  }

  return { email, providedSecret }
}

export async function runBootstrap(
  body: Record<string, unknown>,
  deps: BootstrapDependencies,
): Promise<{ requiresEmailVerification: true }> {
  const { email, providedSecret } = bootstrapInput(body)

  if (!(await deps.verifySecret(providedSecret))) {
    throw new BootstrapPublicError(403, 'invalid_bootstrap', 'Bootstrap não autorizado.')
  }

  if (!(await deps.isAvailable())) {
    throw new BootstrapPublicError(409, 'bootstrap_closed', 'O bootstrap já foi encerrado.')
  }

  const redirectTo = `${deps.appBaseUrl}/auth/finish-invite?kind=bootstrap`
  let userId: string

  try {
    userId = await deps.inviteUser(email, redirectTo)
  } catch {
    throw new BootstrapPublicError(400, 'invite_failed', 'Não foi possível enviar o convite inicial.')
  }

  try {
    await deps.createPair(userId)
  } catch {
    try {
      await deps.deleteUser(userId)
    } catch {
      // No pair membership was committed, so authorization remains closed even if Auth cleanup needs manual repair.
    }
    throw new BootstrapPublicError(409, 'bootstrap_race', 'O bootstrap não pôde ser concluído.')
  }

  return { requiresEmailVerification: true }
}

export async function runBootstrapReinvite(
  body: Record<string, unknown>,
  deps: BootstrapReinviteDependencies,
): Promise<{ requiresEmailVerification: true }> {
  const { email, providedSecret } = bootstrapInput(body)

  if (!(await deps.verifySecret(providedSecret))) {
    throw new BootstrapPublicError(403, 'invalid_bootstrap', 'Bootstrap não autorizado.')
  }

  let state: { attemptId: string; oldUserId: string }
  try {
    state = await deps.begin(email)
  } catch {
    throw new BootstrapPublicError(409, 'reinvite_unavailable', 'O convite inicial não pode ser reenviado neste estado.')
  }

  let currentUserId: string | null
  try {
    currentUserId = await deps.findAuthUser(email)
  } catch {
    throw new BootstrapPublicError(503, 'auth_lookup_failed', 'Não foi possível verificar o convite pendente agora.')
  }

  if (currentUserId === state.oldUserId) {
    try {
      await deps.deleteUser(state.oldUserId)
      currentUserId = null
    } catch {
      try {
        currentUserId = await deps.findAuthUser(email)
      } catch {
        throw new BootstrapPublicError(503, 'auth_lookup_failed', 'Não foi possível verificar o convite pendente agora.')
      }

      if (currentUserId === state.oldUserId) {
        try {
          await deps.abort(state.attemptId)
        } catch {
          // State remains explicit and server-only; a later operator retry can recover it.
        }
        throw new BootstrapPublicError(503, 'cleanup_failed', 'Não foi possível substituir o convite inicial agora.')
      }
    }
  }

  if (!currentUserId) {
    const redirectTo = `${deps.appBaseUrl}/auth/finish-invite?kind=bootstrap`
    try {
      currentUserId = await deps.inviteUser(email, redirectTo)
    } catch {
      // A previous concurrent/retried request may have created the user but lost its response.
      try {
        currentUserId = await deps.findAuthUser(email)
      } catch {
        currentUserId = null
      }
      if (!currentUserId) {
        throw new BootstrapPublicError(503, 'reinvite_send_failed', 'Não foi possível reenviar o convite inicial agora.')
      }
    }
  }

  if (currentUserId === state.oldUserId) {
    throw new BootstrapPublicError(503, 'cleanup_failed', 'Não foi possível substituir o convite inicial agora.')
  }

  try {
    await deps.finish(state.attemptId, currentUserId)
  } catch {
    throw new BootstrapPublicError(503, 'reinvite_finish_failed', 'O reenvio ficou pendente e pode ser tentado novamente.')
  }

  return { requiresEmailVerification: true }
}
