import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.110.9'

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
  return requiredEnv('APP_BASE_URL').replace(/\/$/, '')
}

export function getBootstrapSecret(): string {
  return requiredEnv('BOOTSTRAP_SECRET')
}

export async function getRequestUserId(request: Request): Promise<string>
export async function getRequestUserId(client: SupabaseClient, request: Request): Promise<string>
export async function getRequestUserId(
  clientOrRequest: SupabaseClient | Request,
  maybeRequest?: Request,
): Promise<string> {
  const request = maybeRequest ?? clientOrRequest as Request
  const client = maybeRequest ? clientOrRequest as SupabaseClient : getAdminClient()
  const authorization = request.headers.get('authorization') ?? ''
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  if (!match) throw new Error('authentication_required')

  const { data, error } = await client.auth.getUser(match[1])
  if (error || !data.user) throw new Error('authentication_required')
  return data.user.id
}
