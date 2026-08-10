import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, extname, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT_EXCLUDES = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  'playwright-report',
  'test-results',
])

const CONFIG_EXTENSIONS = new Set(['.json', '.jsonc', '.toml', '.yaml', '.yml'])
const CONFIG_FILENAMES = new Set(['package.json', '.env', '.env.example'])

const FORBIDDEN_RULES = [
  {
    label: 'Supabase paid plan flag',
    pattern: /(?:SUPABASE_PLAN|supabase_plan)\s*[=:]\s*["']?(?:pro|team|enterprise)\b/i,
  },
  {
    label: 'PowerSync paid plan flag',
    pattern: /(?:POWERSYNC_PLAN|powersync_plan)\s*[=:]\s*["']?(?:pro|team|enterprise|paid)\b/i,
  },
  {
    label: 'Cloudflare paid plan flag',
    pattern: /(?:CLOUDFLARE_PLAN|cloudflare_plan)\s*[=:]\s*["']?(?:pro|business|enterprise|paid)\b/i,
  },
  {
    label: 'Vercel Pro flag',
    pattern: /(?:VERCEL_PRO|vercel_pro)\s*[=:]\s*["']?(?:1|true|yes|pro)\b/i,
  },
  {
    label: 'explicit recurring cost above zero',
    pattern: /(?:RECURRING_COST_USD|recurring_cost_usd)\s*[=:]\s*["']?(?!0(?:\.0+)?\b)\d+(?:\.\d+)?/i,
  },
]

function shouldInspect(relativePath) {
  const name = basename(relativePath)
  if (CONFIG_FILENAMES.has(name) || name.startsWith('.env.')) return true
  return CONFIG_EXTENSIONS.has(extname(name).toLowerCase())
}

async function walk(root) {
  const files = []

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && ROOT_EXCLUDES.has(entry.name)) continue
      const absolute = join(directory, entry.name)
      if (entry.isDirectory()) await visit(absolute)
      else if (entry.isFile()) files.push(absolute)
    }
  }

  await visit(root)
  return files
}

export function inspectZeroCostText(text, source = '<memory>') {
  return FORBIDDEN_RULES
    .filter(({ pattern }) => pattern.test(text))
    .map(({ label }) => `${label} in ${source}`)
}

export async function verifyZeroCostConfig(root = process.cwd()) {
  const findings = []

  const pagesFunctions = join(root, 'functions')
  if (await stat(pagesFunctions).then((value) => value.isDirectory()).catch(() => false)) {
    findings.push('root functions/ directory detected; static Cloudflare Pages release must not add Pages Functions')
  }

  const files = await walk(root)
  for (const file of files) {
    const name = relative(root, file).replaceAll('\\', '/')
    if (!shouldInspect(name)) continue
    if (name === 'scripts/verify-zero-cost-config.mjs' || name.endsWith('verify-zero-cost-config.test.mjs')) continue

    const text = await readFile(file, 'utf8').catch(() => '')
    findings.push(...inspectZeroCostText(text, name))
  }

  for (const key of ['SUPABASE_PLAN', 'POWERSYNC_PLAN', 'CLOUDFLARE_PLAN', 'VERCEL_PRO', 'RECURRING_COST_USD']) {
    const value = process.env[key]
    if (!value) continue
    findings.push(...inspectZeroCostText(`${key}=${value}`, `environment:${key}`))
  }

  return [...new Set(findings)].sort()
}

export async function runZeroCostVerification(root = process.cwd()) {
  const findings = await verifyZeroCostConfig(root)
  if (findings.length > 0) {
    throw new Error(`Zero-cost release guard failed:\n- ${findings.join('\n- ')}`)
  }
  return { ok: true }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  runZeroCostVerification()
    .then(() => console.log('Zero-cost release guard passed.'))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
