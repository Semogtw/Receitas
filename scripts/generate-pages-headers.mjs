import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const PUBLIC_ENDPOINT_KEYS = ['VITE_SUPABASE_URL', 'VITE_POWERSYNC_URL']

function exactHttpsOrigin(rawValue, name) {
  if (!rawValue) throw new Error(`${name} is required to generate release headers`)

  let url
  try {
    url = new URL(rawValue)
  } catch {
    throw new Error(`${name} must be a valid absolute URL`)
  }

  if (url.protocol !== 'https:') throw new Error(`${name} must use https`)
  if (url.username || url.password) throw new Error(`${name} must not contain URL credentials`)
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${name} must contain only an origin, without path, query or fragment`)
  }

  return url.origin
}

function websocketOrigin(httpsOrigin) {
  const url = new URL(httpsOrigin)
  url.protocol = 'wss:'
  return url.origin
}

function unquoteEnvValue(raw) {
  const trimmed = raw.trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parsePublicEnv(text) {
  const values = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match || !PUBLIC_ENDPOINT_KEYS.includes(match[1])) continue
    values[match[1]] = unquoteEnvValue(match[2])
  }
  return values
}

export async function resolveReleasePublicEnv({ root = process.cwd(), env = process.env } = {}) {
  const resolved = {}
  for (const filename of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    const text = await readFile(join(root, filename), 'utf8').catch(() => null)
    if (text !== null) Object.assign(resolved, parsePublicEnv(text))
  }

  for (const key of PUBLIC_ENDPOINT_KEYS) {
    if (env[key]?.trim()) resolved[key] = env[key].trim()
  }
  return resolved
}

export function buildPagesHeaders({ supabaseUrl, powersyncUrl, releaseEnv = 'preview' }) {
  const supabaseOrigin = exactHttpsOrigin(supabaseUrl, 'VITE_SUPABASE_URL')
  const powersyncOrigin = exactHttpsOrigin(powersyncUrl, 'VITE_POWERSYNC_URL')
  const powersyncWebSocketOrigin = websocketOrigin(powersyncOrigin)

  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self' data:",
    `img-src 'self' data: blob: ${supabaseOrigin}`,
    `connect-src 'self' ${supabaseOrigin} ${powersyncOrigin} ${powersyncWebSocketOrigin}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join('; ')

  const lines = [
    '/*',
    `  Content-Security-Policy: ${csp}`,
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: no-referrer',
    '  Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=(), usb=()',
    '  X-Frame-Options: DENY',
    '  X-Robots-Tag: noindex, nofollow',
  ]

  if (releaseEnv === 'production') {
    lines.push('  Strict-Transport-Security: max-age=31536000; includeSubDomains')
  }

  return `${lines.join('\n')}\n`
}

export async function generatePagesHeaders({
  outputPath = join('dist', '_headers'),
  root = process.cwd(),
  env = process.env,
  supabaseUrl,
  powersyncUrl,
  releaseEnv = env.RELEASE_ENV ?? 'preview',
} = {}) {
  const publicEnv = await resolveReleasePublicEnv({ root, env })
  const content = buildPagesHeaders({
    supabaseUrl: supabaseUrl ?? publicEnv.VITE_SUPABASE_URL,
    powersyncUrl: powersyncUrl ?? publicEnv.VITE_POWERSYNC_URL,
    releaseEnv,
  })
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, content, 'utf8')
  return content
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  generatePagesHeaders()
    .then(() => console.log('Cloudflare Pages security headers generated.'))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
