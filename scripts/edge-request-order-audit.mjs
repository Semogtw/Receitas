import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

import { executableSource } from './source-code-mask.mjs'

const BODY_READ_PATTERN = /\b(?:readJsonObject|readBoundedJsonObject)\s*\(\s*request\b/g
const PRIVILEGED_CALL_PATTERNS = [
  /\bgetAdminClient\s*\(/g,
  /\bcreateServerClient\s*\(/g,
  /\bgetClient\s*\(/g,
  /\bcreateClient\s*\(/g,
  /\bgetUserId\s*\(/g,
  /\brequestUserId\s*\(/g,
]

function firstMatchIndex(source, pattern) {
  pattern.lastIndex = 0
  const match = pattern.exec(source)
  pattern.lastIndex = 0
  return match?.index ?? -1
}

/**
 * JSON Edge endpoints should reject malformed/oversized input on the cheapest
 * path. In particular, the bounded body reader must run before service-role
 * client construction or authenticated-user lookup.
 */
export function inspectEdgeRequestOrderSource(content, filename = 'index.ts') {
  const source = executableSource(content)
  const bodyIndex = firstMatchIndex(source, BODY_READ_PATTERN)
  if (bodyIndex < 0) return []

  const privilegedIndexes = PRIVILEGED_CALL_PATTERNS
    .map((pattern) => firstMatchIndex(source, pattern))
    .filter((index) => index >= 0)

  if (privilegedIndexes.length === 0) return []
  const privilegedIndex = Math.min(...privilegedIndexes)
  if (privilegedIndex < bodyIndex) {
    return [
      `${filename}: bounded JSON parsing must happen before privileged client/auth work`,
    ]
  }

  return []
}

async function edgeEntrypoints(root) {
  const functionsDir = join(root, 'supabase', 'functions')
  const entries = await readdir(functionsDir, { withFileTypes: true })
  const paths = []

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === '_shared') continue
    const path = join(functionsDir, entry.name, 'index.ts')
    const content = await readFile(path, 'utf8').catch(() => null)
    if (content !== null) paths.push({ path, content })
  }

  return paths.sort((left, right) => left.path.localeCompare(right.path))
}

export async function auditEdgeRequestOrder(root = process.cwd()) {
  const findings = []
  for (const { path, content } of await edgeEntrypoints(root)) {
    findings.push(...inspectEdgeRequestOrderSource(content, relative(root, path)))
  }
  return [...new Set(findings)].sort()
}

export async function runEdgeRequestOrderAudit(root = process.cwd()) {
  const findings = await auditEdgeRequestOrder(root)
  if (findings.length > 0) {
    throw new Error(`Edge request order audit failed:\n- ${findings.join('\n- ')}`)
  }
  return { ok: true }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  runEdgeRequestOrderAudit()
    .then(() => console.log('Edge request order audit passed.'))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
