import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, extname, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

const TEXT_EXTENSIONS = new Set([
  '.html',
  '.js',
  '.mjs',
  '.cjs',
  '.css',
  '.json',
  '.webmanifest',
  '.txt',
  '.xml',
  '.svg',
])

const FORBIDDEN_MARKERS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SERVICE_ROLE_KEY',
  'BOOTSTRAP_SECRET',
  'BEGIN PRIVATE KEY',
  'BEGIN RSA PRIVATE KEY',
  'BEGIN EC PRIVATE KEY',
]

const SECRET_ENV_KEYS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
  'BOOTSTRAP_SECRET',
  'E2E_PASSWORD',
  'TEST_PASSWORD',
  'TEST_TOKEN',
]

function sensitiveFilename(path) {
  const name = basename(path).toLowerCase()
  return name === '.env'
    || name.startsWith('.env.')
    || name.endsWith('.pem')
    || name.endsWith('.key')
    || name === 'credentials.json'
    || name === 'service-account.json'
}

async function walk(root) {
  const files = []

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name)
      if (entry.isDirectory()) await visit(absolute)
      else if (entry.isFile()) files.push(absolute)
    }
  }

  await visit(root)
  return files
}

export async function validateBuildSecrets(root = 'dist', env = process.env) {
  const rootInfo = await stat(root).catch(() => null)
  if (!rootInfo?.isDirectory()) {
    throw new Error(`Build output directory does not exist: ${root}`)
  }

  const secretValues = SECRET_ENV_KEYS
    .map((key) => [key, env[key]])
    .filter(([, value]) => typeof value === 'string' && value.length >= 8)

  const findings = []
  for (const file of await walk(root)) {
    const name = relative(root, file).replaceAll('\\', '/')

    if (sensitiveFilename(file)) findings.push(`sensitive-looking file shipped: ${name}`)
    if (file.endsWith('.map')) findings.push(`source map shipped: ${name}`)
    if (!TEXT_EXTENSIONS.has(extname(file).toLowerCase())) continue

    const content = await readFile(file, 'utf8')
    for (const marker of FORBIDDEN_MARKERS) {
      if (content.includes(marker)) findings.push(`forbidden privileged marker ${marker} in ${name}`)
    }

    if (/["']role["']\s*:\s*["']service_role["']/.test(content)) {
      findings.push(`literal service_role claim in ${name}`)
    }

    for (const [key, value] of secretValues) {
      if (content.includes(value)) findings.push(`configured secret value from ${key} in ${name}`)
    }
  }

  return [...new Set(findings)].sort()
}

export async function runBuildSecretValidation(root = process.argv[2] ?? 'dist') {
  const findings = await validateBuildSecrets(root)
  if (findings.length > 0) {
    throw new Error(`Build secret validation failed:\n- ${findings.join('\n- ')}`)
  }
  return { ok: true }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  runBuildSecretValidation()
    .then(() => console.log('Build secret validation passed.'))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
