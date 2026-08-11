import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx'])

async function sourceFiles(root) {
  const files = []

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(path)
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) {
        files.push(path)
      }
    }
  }

  await visit(join(root, 'src'))
  return files.sort()
}

export function inspectCspCompatibleSource(content, filename = 'source.tsx') {
  const findings = []

  if (/\bstyle\s*=\s*\{/.test(content)) {
    findings.push(`${filename}: JSX inline style detected; production CSP intentionally keeps style-src 'self' without unsafe-inline`)
  }
  if (/\bdangerouslySetInnerHTML\s*=/.test(content)) {
    findings.push(`${filename}: dangerouslySetInnerHTML is forbidden in application source`)
  }
  if (/\b(?:window\.)?eval\s*\(/.test(content)) {
    findings.push(`${filename}: eval() is forbidden by the strict production CSP`)
  }
  if (/\bnew\s+Function\s*\(/.test(content)) {
    findings.push(`${filename}: new Function() is forbidden by the strict production CSP`)
  }
  if (/\.innerHTML\s*=/.test(content) || /\.outerHTML\s*=/.test(content) || /\.insertAdjacentHTML\s*\(/.test(content)) {
    findings.push(`${filename}: direct HTML injection API detected; use React rendering or safe DOM primitives`)
  }

  return findings
}

export async function auditCspCompatibleSource(root = process.cwd()) {
  const findings = []
  for (const path of await sourceFiles(root)) {
    const content = await readFile(path, 'utf8')
    findings.push(...inspectCspCompatibleSource(content, relative(root, path)))
  }

  const headersSource = await readFile(join(root, 'scripts', 'generate-pages-headers.mjs'), 'utf8')
  if (!headersSource.includes('"style-src \'self\'"')) {
    findings.push("Pages CSP must keep style-src 'self' without unsafe-inline")
  }
  if (/style-src[^\n;]*unsafe-inline/.test(headersSource)) {
    findings.push("Pages CSP must not weaken style-src with unsafe-inline")
  }
  if (/script-src[^\n;]*unsafe-(?:inline|eval)/.test(headersSource)) {
    findings.push('Pages CSP must not weaken script-src with unsafe-inline or unsafe-eval')
  }

  return findings
}

export async function runCspSourceAudit(root = process.cwd()) {
  const findings = await auditCspCompatibleSource(root)
  if (findings.length > 0) throw new Error(`CSP source audit failed:\n- ${findings.join('\n- ')}`)
  return { ok: true }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  runCspSourceAudit()
    .then(() => console.log('CSP source audit passed.'))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
