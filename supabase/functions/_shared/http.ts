import { parseAllowedApplicationOrigins } from './origin.ts'

const defaultAllowedHeaders = 'authorization, x-client-info, apikey, content-type'
export const DEFAULT_JSON_BODY_LIMIT_BYTES = 32 * 1024

function configuredOrigins(): Set<string> {
  const configured = Deno.env.get('ALLOWED_ORIGINS') ?? Deno.env.get('APP_BASE_URL') ?? ''
  return parseAllowedApplicationOrigins(configured)
}

export function requestOriginAllowed(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true

  try {
    return configuredOrigins().has(origin)
  } catch {
    // Fail closed when deployment origin configuration is absent or malformed.
    return false
  }
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

async function readBoundedBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const contentLength = request.headers.get('content-length')
  if (contentLength !== null) {
    const declared = Number(contentLength)
    if (Number.isFinite(declared) && declared > maxBytes) throw new Error('request_body_too_large')
  }

  if (!request.body) return new Uint8Array()

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel('request_body_too_large').catch(() => undefined)
        throw new Error('request_body_too_large')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export async function readJsonObject(
  request: Request,
  maxBytes = DEFAULT_JSON_BODY_LIMIT_BYTES,
): Promise<Record<string, unknown>> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('invalid_json_body_limit')

  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(await readBoundedBody(request, maxBytes))
  } catch (error) {
    if (error instanceof Error && error.message === 'request_body_too_large') throw error
    throw new Error('invalid_json_object')
  }

  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('invalid_json_object')
  }
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

export function safeErrorClass(error: unknown): string {
  if (!(error instanceof Error)) return 'UnknownError'
  const name = error.name.trim()
  return /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(name) ? name : 'Error'
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
      // Do not log arbitrary exception messages: SDK/network errors may include
      // URLs, payload fragments or other user/infra context. The class is enough
      // to distinguish broad failure families without persisting sensitive data.
      console.error('edge_handler_internal_error', safeErrorClass(error))
      return jsonResponse(request, { error: 'internal_error' }, 500)
    }
  }
}
