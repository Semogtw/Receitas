import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const JWT_REQUIRED_FUNCTIONS = ['pair-invite', 'import-url', 'backup-restore', 'account-admin', 'permanent-delete']
export const CANONICAL_MEDIA_BUCKET = 'recipe-media'

function parseRelevantToml(content) {
  const sections = new Map()
  let currentSection = ''

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const sectionMatch = line.match(/^\[([^\]]+)\]$/)
    if (sectionMatch) {
      currentSection = sectionMatch[1]
      if (!sections.has(currentSection)) sections.set(currentSection, new Map())
      continue
    }

    const assignment = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/)
    if (!assignment) continue
    if (!sections.has(currentSection)) sections.set(currentSection, new Map())
    sections.get(currentSection).set(assignment[1], assignment[2].trim())
  }

  return sections
}

function value(sections, section, key) {
  return sections.get(section)?.get(key) ?? null
}

function booleanValue(sections, section, key) {
  const raw = value(sections, section, key)
  if (raw === 'true') return true
  if (raw === 'false') return false
  return null
}

function integerValue(sections, section, key) {
  const raw = value(sections, section, key)
  return raw && /^\d+$/.test(raw) ? Number(raw) : null
}

export function inspectSupabaseConfig(content) {
  const findings = []
  const sections = parseRelevantToml(content)

  if (booleanValue(sections, 'auth', 'enable_signup') !== false) findings.push('auth.enable_signup must remain false')
  if (booleanValue(sections, 'auth.email', 'enable_signup') !== false) findings.push('auth.email.enable_signup must remain false')
  if (booleanValue(sections, 'auth', 'enable_anonymous_sign_ins') !== false) findings.push('auth.enable_anonymous_sign_ins must remain false')

  const minimumPasswordLength = integerValue(sections, 'auth', 'minimum_password_length')
  if (minimumPasswordLength === null || minimumPasswordLength < 12) {
    findings.push('auth.minimum_password_length must be at least 12')
  }

  if (booleanValue(sections, `storage.buckets.${CANONICAL_MEDIA_BUCKET}`, 'public') !== false) {
    findings.push(`${CANONICAL_MEDIA_BUCKET} bucket must remain private and use the canonical bucket id`)
  }

  if (booleanValue(sections, 'functions.bootstrap', 'verify_jwt') !== false) {
    findings.push('bootstrap JWT exception must remain explicit; bootstrap performs its own one-time authorization')
  }

  for (const functionName of JWT_REQUIRED_FUNCTIONS) {
    if (booleanValue(sections, `functions.${functionName}`, 'verify_jwt') !== true) {
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

export function inspectPrivatePrivilegeSql(content, filename = 'migration.sql') {
  const findings = []
  const normalized = content
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')

  const unsafeRoles = '(?:public|anon|authenticated)'
  const schemaGrant = new RegExp(`grant\\s+usage\\s+on\\s+schema\\s+private\\s+to\\s+${unsafeRoles}\\b`, 'i')
  const functionGrant = new RegExp(`grant\\s+(?:execute|all)\\s+on\\s+function\\s+private\\.[^;]+?\\s+to\\s+${unsafeRoles}\\b`, 'i')

  if (schemaGrant.test(normalized)) {
    findings.push(`${filename}: private schema USAGE must not be granted to browser roles`)
  }
  if (functionGrant.test(normalized)) {
    findings.push(`${filename}: private function EXECUTE must not be granted to browser roles`)
  }

  return findings
}

export function inspectMediaBucketSource({ mediaConfig, restoreCommit, storageMigration }) {
  const findings = []
  const quotedCanonical = `'${CANONICAL_MEDIA_BUCKET}'`

  if (!mediaConfig.includes(`MEDIA_STORAGE_BUCKET = ${quotedCanonical}`)) {
    findings.push(`frontend media bucket must be ${CANONICAL_MEDIA_BUCKET}`)
  }
  if (!restoreCommit.includes(`RECIPE_MEDIA_BUCKET = ${quotedCanonical}`)) {
    findings.push(`restore media bucket must be ${CANONICAL_MEDIA_BUCKET}`)
  }
  if (!storageMigration.includes(quotedCanonical) || !storageMigration.includes(`bucket_id = ${quotedCanonical}`)) {
    findings.push(`storage migration must create and protect ${CANONICAL_MEDIA_BUCKET}`)
  }
  if (/['"]recipe_media['"]/.test(`${mediaConfig}\n${restoreCommit}\n${storageMigration}`)) {
    findings.push('underscore recipe_media bucket id is forbidden; canonical id is recipe-media')
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
    const migrationNames = await readdir(migrationDir)
    findings.push(...inspectMigrationSequence(migrationNames))

    for (const name of migrationNames.filter((entry) => entry.endsWith('.sql')).sort()) {
      const content = await readFile(join(migrationDir, name), 'utf8')
      findings.push(...inspectPrivatePrivilegeSql(content, name))
    }
  }

  const [mediaConfig, restoreCommit, storageMigration] = await Promise.all([
    readFile(join(root, 'src', 'features', 'media', 'media-config.ts'), 'utf8').catch(() => ''),
    readFile(join(root, 'supabase', 'functions', 'backup-restore', 'commit.ts'), 'utf8').catch(() => ''),
    readFile(join(root, 'supabase', 'migrations', '0015_media_storage.sql'), 'utf8').catch(() => ''),
  ])
  findings.push(...inspectMediaBucketSource({ mediaConfig, restoreCommit, storageMigration }))

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
