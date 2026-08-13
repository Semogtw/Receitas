import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

import { executableSource } from './source-code-mask.mjs'

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])
const TEST_FILE = /(?:\.test|\.spec)\.[cm]?[jt]sx?$/

export function inspectFrontendMediaPrivacySource(content, filename = 'source.ts') {
  const findings = []
  const source = executableSource(content)

  if (/\.\s*getPublicUrl\s*\(/.test(source)) {
    findings.push(`${filename}: private recipe media must not use Supabase getPublicUrl()`)
  }

  if (/\/storage\/v1\/object\/public\//i.test(content)) {
    findings.push(`${filename}: private recipe media must not embed a public Supabase Storage object URL`)
  }

  return findings
}

async function frontendSourceFiles(root) {
  const base = join(root, 'src')
  const files = []

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(path)
        continue
      }
      if (!entry.isFile()) continue
      if (!SOURCE_EXTENSIONS.has(extname(entry.name))) continue
      if (TEST_FILE.test(entry.name)) continue
      files.push(path)
    }
  }

  await visit(base)
  return files.sort()
}

export async function auditFrontendMediaPrivacy(root = process.cwd()) {
  const findings = []
  for (const path of await frontendSourceFiles(root)) {
    const content = await readFile(path, 'utf8')
    findings.push(...inspectFrontendMediaPrivacySource(content, relative(root, path)))
  }
  return [...new Set(findings)].sort()
}

export async function runFrontendMediaPrivacyAudit(root = process.cwd()) {
  const findings = await auditFrontendMediaPrivacy(root)
  if (findings.length > 0) {
    throw new Error(`Frontend media privacy audit failed:\n- ${findings.join('\n- ')}`)
  }
  return { ok: true }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  runFrontendMediaPrivacyAudit()
    .then(() => console.log('Frontend media privacy audit passed.'))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
