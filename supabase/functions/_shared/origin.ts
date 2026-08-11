function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1'
}

export function normalizeApplicationOrigin(rawValue: string, name = 'origin'): string {
  const value = rawValue.trim()
  if (!value) throw new Error(`${name}_required`)

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${name}_invalid`)
  }

  if (url.username || url.password) throw new Error(`${name}_credentials_not_allowed`)
  if (url.pathname !== '/' || url.search || url.hash) throw new Error(`${name}_must_be_origin_only`)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopbackHostname(url.hostname))) {
    throw new Error(`${name}_https_required`)
  }

  return url.origin
}

export function parseAllowedApplicationOrigins(rawValue: string): Set<string> {
  const origins = rawValue
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => normalizeApplicationOrigin(value, 'allowed_origin'))

  if (origins.length === 0) throw new Error('allowed_origin_required')
  return new Set(origins)
}
