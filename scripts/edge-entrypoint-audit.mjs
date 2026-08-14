import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

import { executableSource } from './source-code-mask.mjs'

const GUARDED_SERVE_LINE = /^\s*if\s*\(\s*import\.meta\.main\s*\)\s*Deno\.serve\s*\(/

export function inspectEdgeEntrypointSource(content, filename = 'index.ts') {
  const source = executableSource(content)
  const serveLines = source
    .split(/\r?\n/)
    .filter((line) => /\bDeno\.serve\s*\(/.test(line))

  if (serveLines.length === 0) {
    return [`${filename}: Edge entrypoint must start its production server with Deno.serve()`]
  }
  if (serveLines.length !== 1) {
    return [`${filename}: Edge entrypoint must contain exactly one production Deno.serve() call`]
  }
  if (!GUARDED_SERVE_LINE.test(serveLines[0])) {
    return [
      `${filename}: Deno.serve() must be guarded on the same line by if (import.meta.main) so tests can import the entrypoint safely`,
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

export async function auditEdgeEntrypoints(root = process.cwd()) {
  const findings = []
  for (const { path, content } of await edgeEntrypoints(root)) {
    findings.push(...inspectEdgeEntrypointSource(content, relative(root, path)))
  }
  return [...new Set(findings)].sort()
}

export async function runEdgeEntrypointAudit(root = process.cwd()) {
  const findings = await auditEdgeEntrypoints(root)
  if (findings.length > 0) {
    throw new Error(`Edge entrypoint audit failed:\n- ${findings.join('\n- ')}`)
  }
  return { ok: true }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  runEdgeEntrypointAudit()
    .then(() => console.log('Edge entrypoint audit passed.'))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
