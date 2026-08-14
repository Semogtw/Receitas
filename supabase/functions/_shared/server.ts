import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.110.9'
import { normalizeApplicationOrigin } from './origin.ts'

let adminClient: SupabaseClient | undefined

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`Missing server environment variable: ${name}`)
  return value
}

export function getAdminClient(): SupabaseClient {
  if (!adminClient) {
    const secretKey = Deno.env.get('SUPABASE_SECRET_KEY')?.trim()
      || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()

    if (!secretKey) {
      throw new Error('Missing Supabase server secret key')
    }

    adminClient = createClient(requiredEnv('SUPABASE_URL'), secretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    })
  }

  return adminClient
}

/**
 * Explicit server-only alias used by newer Edge Functions. Keeping getAdminClient
 * preserves the older bootstrap/pair-invite call sites while avoiding a second
 * client configuration path.
 */
export function createServerClient(): SupabaseClient {
  return getAdminClient()
}

export function getAppBaseUrl(): string {
  return normalizeApplicationOrigin(requiredEnv('APP_BASE_URL'), 'app_base_url')
}

export function getBootstrapSecret(): string {
  return requiredEnv('BOOTSTRAP_SECRET')
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get('authorization') ?? ''
  const match = authorization.match(/^Bearer\s+([^\s].*)$/i)
  const token = match?.[1]?.trim()
  if (!token) throw new Error('authentication_required')
  return token
}

export async function getRequestUserId(request: Request): Promise<string>
export async function getRequestUserId(client: SupabaseClient, request: Request): Promise<string>
export async function getRequestUserId(
  clientOrRequest: SupabaseClient | Request,
  maybeRequest?: Request,
): Promise<string> {
  const request = maybeRequest ?? clientOrRequest as Request
  // Parse the untrusted Authorization header before constructing a privileged
  // client. Requests without a usable Bearer token should not touch secrets/env.
  const token = bearerToken(request)
  const client = maybeRequest ? clientOrRequest as SupabaseClient : getAdminClient()

  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) throw new Error('authentication_required')
  return data.user.id
}
