const defaultAllowedHeaders = 'authorization, x-client-info, apikey, content-type'

function configuredOrigins(): Set<string> {
  const configured = Deno.env.get('ALLOWED_ORIGINS') ?? Deno.env.get('APP_BASE_URL') ?? ''
  return new Set(
    configured
      .split(',')
      .map((value) => value.trim().replace(/\/$/, ''))
      .filter(Boolean),
  )
}

export function requestOriginAllowed(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true
  return configuredOrigins().has(origin.replace(/\/$/, ''))
}

export function corsHeadersFor(request: Request): HeadersInit {
  const origin = request.headers.get('origin')
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': defaultAllowedHeaders,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }

  if (origin && requestOriginAllowed(request)) {
    headers['Access-Control-Allow-Origin'] = origin
  }

  return headers
}

export function preflightResponse(request: Request): Response {
  if (!requestOriginAllowed(request)) {
    return jsonResponse(request, { error: 'Origin não permitida.' }, 403)
  }

  return new Response(null, { status: 204, headers: corsHeadersFor(request) })
}

export function jsonResponse(request: Request, body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: corsHeadersFor(request),
  })
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const value = await request.json()
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid_json_object')
  }
  return value as Record<string, unknown>
}

function responseWithCors(request: Request, response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(corsHeadersFor(request))) {
    if (typeof value === 'string') headers.set(name, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

/**
 * Wrapper for newer Edge handlers that centralizes OPTIONS/origin handling and
 * ensures ordinary handler responses carry the same strict CORS headers as the
 * older explicit jsonResponse() call sites.
 */
export function withCorsAndErrors(
  handler: (request: Request) => Promise<Response> | Response,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    if (request.method === 'OPTIONS') return preflightResponse(request)
    if (!requestOriginAllowed(request)) {
      return jsonResponse(request, { error: 'origin_not_allowed' }, 403)
    }

    try {
      return responseWithCors(request, await handler(request))
    } catch (error) {
      if (error instanceof Error && error.message === 'authentication_required') {
        return jsonResponse(request, { error: 'authentication_required' }, 401)
      }
      console.error('edge_handler_internal_error', error instanceof Error ? error.message : 'unknown')
      return jsonResponse(request, { error: 'internal_error' }, 500)
    }
  }
}
