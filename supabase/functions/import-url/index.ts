import { withCorsAndErrors } from '../_shared/http.ts'
import { createServerClient, getRequestUserId } from '../_shared/server.ts'
import { ImportFetchError, safeFetchImportPayload } from './safe-fetch.ts'
import { sanitizeImportPayload } from './sanitize-payload.ts'

const MAX_REQUEST_BYTES = 8 * 1024
const MAX_URL_LENGTH = 2_048

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

async function requestJson(request: Request): Promise<Record<string, unknown> | null> {
  const declaredLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) return null

  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) return null
  try {
    const value: unknown = JSON.parse(text)
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function importFailure(error: ImportFetchError): Response {
  const invalidInput = new Set([
    'invalid_url',
    'http_or_https_required',
    'credentials_not_allowed',
    'port_not_allowed',
    'hostname_not_allowed',
    'resolved_address_not_public',
    'dns_resolution_failed',
    'invalid_redirect_url',
    'https_downgrade_not_allowed',
  ])
  if (invalidInput.has(error.code)) return json(400, { error: 'url_not_allowed' })
  if (error.code === 'content_type_not_allowed') return json(415, { error: 'content_type_not_supported' })
  if (error.code === 'response_too_large') return json(413, { error: 'source_too_large' })
  if (error.code === 'fetch_timeout') return json(504, { error: 'source_timeout' })
  if (error.code === 'too_many_redirects' || error.code === 'redirect_without_location') {
    return json(422, { error: 'source_redirect_invalid' })
  }
  return json(422, { error: 'source_unavailable' })
}

const handler = async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  const admin = createServerClient()
  const userId = await getRequestUserId(admin, request)

  const body = await requestJson(request)
  if (!body) return json(400, { error: 'invalid_request' })
  const rawUrl = typeof body.url === 'string' ? body.url.trim() : ''
  if (!rawUrl || rawUrl.length > MAX_URL_LENGTH) return json(400, { error: 'invalid_url' })

  const { data: membership, error: membershipError } = await admin
    .from('pair_members')
    .select('pair_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (membershipError) return json(503, { error: 'membership_check_unavailable' })
  if (!membership) return json(403, { error: 'pair_membership_required' })

  const { data: allowed, error: rateLimitError } = await admin.rpc('consume_import_url_rate_limit', {
    p_user_id: userId,
  })
  if (rateLimitError) return json(503, { error: 'rate_limit_unavailable' })
  if (allowed !== true) return json(429, { error: 'rate_limit_exceeded' })

  try {
    const fetched = await safeFetchImportPayload(rawUrl)
    return json(200, sanitizeImportPayload(fetched))
  } catch (error) {
    if (error instanceof ImportFetchError) return importFailure(error)
    return json(422, { error: 'source_unavailable' })
  }
}

Deno.serve(withCorsAndErrors(handler))
