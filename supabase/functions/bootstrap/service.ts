import { normalizeEmail } from '../_shared/crypto.ts'

export interface BootstrapDependencies {
  verifySecret(provided: string): Promise<boolean>
  isAvailable(): Promise<boolean>
  inviteUser(email: string, redirectTo: string): Promise<string>
  createPair(userId: string): Promise<void>
  deleteUser(userId: string): Promise<void>
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

export async function runBootstrap(
  body: Record<string, unknown>,
  deps: BootstrapDependencies,
): Promise<{ requiresEmailVerification: true }> {
  const email = normalizeEmail(body.email)
  const providedSecret = typeof body.bootstrapSecret === 'string' ? body.bootstrapSecret : ''

  if (!email) {
    throw new BootstrapPublicError(400, 'invalid_request', 'Informe um e-mail válido.')
  }

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
      // The product authorization boundary is still safe: no pair membership was committed.
    }
    throw new BootstrapPublicError(409, 'bootstrap_race', 'O bootstrap não pôde ser concluído.')
  }

  return { requiresEmailVerification: true }
}
