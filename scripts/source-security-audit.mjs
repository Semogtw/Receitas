import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const JWT_REQUIRED_FUNCTIONS = ['pair-invite', 'import-url', 'backup-restore', 'account-admin']

function tomlBoolean(content, key) {
  const match = content.match(new RegExp(`^\\s*${key}\\s*=\\s*(true|false)\\s*$`, 'm'))
  return match ? match[1] === 'true' : null
}

function tomlInteger(content, key) {
  const match = content.match(new RegExp(`^\\s*${key}\\s*=\\s*(\\d+)\\s*$`, 'm'))
  return match ? Number(match[1]) : null
}

function tomlSection(content, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = content.match(new RegExp(`^\\[${escaped}\\]\\s*$([\\s\\S]*?)(?=^\\[|\\s*$)`, 'm'))
  return match?.[1] ?? null
}

export function inspectSupabaseConfig(content) {
  const findings = []
  const auth = tomlSection(content, 'auth') ?? ''
  const authEmail = tomlSection(content, 'auth.email') ?? ''
  const recipeMedia = tomlSection(content, 'storage.buckets.recipe_media') ?? ''

  if (tomlBoolean(auth, 'enable_signup') !== false) findings.push('auth.enable_signup must remain false')
  if (tomlBoolean(authEmail, 'enable_signup') !== false) findings.push('auth.email.enable_signup must remain false')
  if (tomlBoolean(auth, 'enable_anonymous_sign_ins') !== false) findings.push('auth.enable_anonymous_sign_ins must remain false')

  const minimumPasswordLength = tomlInteger(auth, 'minimum_password_length')
  if (minimumPasswordLength === null || minimumPasswordLength < 12) {
    findings.push('auth.minimum_password_length must be at least 12')
  }

  if (tomlBoolean(recipeMedia, 'public') !== false) findings.push('recipe_media bucket must remain private')

  const bootstrap = tomlSection(content, 'functions.bootstrap') ?? ''
  if (tomlBoolean(bootstrap, 'verify_jwt') !== false) {
    findings.push('bootstrap JWT exception must remain explicit; bootstrap performs its own one-time authorization')
  }

  for (const functionName of JWT_REQUIRED_FUNCTIONS) {
    const section = tomlSection(content, `functions.${functionName}`) ?? ''
    if (tomlBoolean(section, 'verify_jwt') !== true) {
      findings.push(`${functionName} must require Supabase JWT verification`)
    }
  }

  return findings
}

export function inspectMigrationSequence(names) {
  const findings = []
  const numbered = names
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .map((name) => ({ name, number: Number(name.slice(0, 4)) }))
    .sort((a, b) => a.number - b.number || a.name.localeCompare(b.name))

  if (numbered.length === 0) return ['no numbered Supabase migrations found']

  const seen = new Map()
  for (const item of numbered) {
    if (seen.has(item.number)) {
      findings.push(`duplicate migration number ${String(item.number).padStart(4, '0')}: ${seen.get(item.number)} and ${item.name}`)
    } else {
      seen.set(item.number, item.name)
    }
  }

  const max = numbered.at(-1).number
  for (let number = 1; number <= max; number += 1) {
    if (!seen.has(number)) findings.push(`missing migration number ${String(number).padStart(4, '0')}`)
  }

  return findings
}

export async function auditSourceSecurity(root = process.cwd()) {
  const findings = []
  const configPath = join(root, 'supabase', 'config.toml')
  const config = await readFile(configPath, 'utf8').catch(() => null)
  if (config === null) findings.push('supabase/config.toml is missing')
  else findings.push(...inspectSupabaseConfig(config))

  const migrationDir = join(root, 'supabase', 'migrations')
  const migrationInfo = await stat(migrationDir).catch(() => null)
  if (!migrationInfo?.isDirectory()) {
    findings.push('supabase/migrations directory is missing')
  } else {
    findings.push(...inspectMigrationSequence(await readdir(migrationDir)))
  }

  return [...new Set(findings)].sort()
}

export async function runSourceSecurityAudit(root = process.cwd()) {
  const findings = await auditSourceSecurity(root)
  if (findings.length > 0) {
    throw new Error(`Source security audit failed:\n- ${findings.join('\n- ')}`)
  }
  return { ok: true }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  runSourceSecurityAudit()
    .then(() => console.log('Source security audit passed.'))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
