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
