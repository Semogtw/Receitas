const MAX_RECENT_AUTH_AGE_SECONDS = 5 * 60
const MAX_FUTURE_SKEW_SECONDS = 60

interface JwtAmrEntry {
  method?: unknown
  timestamp?: unknown
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  return atob(padded)
}

function jwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('recent_auth_invalid_token')
  try {
    const parsed: unknown = JSON.parse(decodeBase64Url(parts[1]!))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid')
    return parsed as Record<string, unknown>
  } catch {
    throw new Error('recent_auth_invalid_token')
  }
}

export function bearerToken(request: Request): string {
  const authorization = request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(authorization)
  if (!match) throw new Error('authentication_required')
  return match[1]!
}

export function assertRecentPasswordAuthentication(
  token: string,
  expectedUserId: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): void {
  const payload = jwtPayload(token)
  if (payload.sub !== expectedUserId) throw new Error('recent_auth_subject_mismatch')
  if (!Array.isArray(payload.amr)) throw new Error('recent_password_auth_required')

  const passwordTimestamps = payload.amr.flatMap((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
    const entry = raw as JwtAmrEntry
    if (entry.method !== 'password' || typeof entry.timestamp !== 'number' || !Number.isFinite(entry.timestamp)) return []
    return [Math.floor(entry.timestamp)]
  })
  if (passwordTimestamps.length === 0) throw new Error('recent_password_auth_required')

  const mostRecent = Math.max(...passwordTimestamps)
  if (mostRecent > nowSeconds + MAX_FUTURE_SKEW_SECONDS) throw new Error('recent_password_auth_invalid')
  if (nowSeconds - mostRecent > MAX_RECENT_AUTH_AGE_SECONDS) throw new Error('recent_password_auth_required')
}

export { MAX_RECENT_AUTH_AGE_SECONDS }
