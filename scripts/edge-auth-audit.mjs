import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

import { executableSource } from './source-code-mask.mjs'

const EXPLICITLY_PUBLIC_EDGE_FUNCTIONS = new Set(['bootstrap'])

export function inspectEdgeAuthSource(content, functionName, filename = 'index.ts') {
  if (EXPLICITLY_PUBLIC_EDGE_FUNCTIONS.has(functionName)) return []

  const source = executableSource(content)
  if (!/\bgetRequestUserId\s*\(/.test(source)) {
    return [
      `${filename}: protected Edge entrypoint must resolve the authenticated user with getRequestUserId()`,
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
    if (content !== null) paths.push({ functionName: entry.name, path, content })
  }

  return paths.sort((a, b) => a.path.localeCompare(b.path))
}

export async function auditEdgeAuthentication(root = process.cwd()) {
  const findings = []
  for (const { functionName, path, content } of await edgeEntrypoints(root)) {
    findings.push(...inspectEdgeAuthSource(content, functionName, relative(root, path)))
  }
  return [...new Set(findings)].sort()
}

export async function runEdgeAuthAudit(root = process.cwd()) {
  const findings = await auditEdgeAuthentication(root)
  if (findings.length > 0) {
    throw new Error(`Edge authentication audit failed:\n- ${findings.join('\n- ')}`)
  }
  return { ok: true }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  runEdgeAuthAudit()
    .then(() => console.log('Edge authentication audit passed.'))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
