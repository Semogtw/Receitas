import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

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

export async function auditReleaseArtifact(root = 'dist') {
  const rootInfo = await stat(root).catch(() => null)
  if (!rootInfo?.isDirectory()) return [`release directory does not exist: ${root}`]

  const files = await walk(root)
  const names = new Set(files.map((file) => relative(root, file).replaceAll('\\', '/')))
  const findings = []

  for (const required of ['index.html', 'robots.txt', '_redirects', '_headers']) {
    if (!names.has(required)) findings.push(`missing release artifact: ${required}`)
  }

  if (![...names].some((name) => name.endsWith('.webmanifest') || name === 'manifest.json')) {
    findings.push('missing PWA web manifest')
  }

  if (names.has('robots.txt')) {
    const robots = await readFile(join(root, 'robots.txt'), 'utf8')
    if (!/^\s*User-agent:\s*\*\s*$/im.test(robots) || !/^\s*Disallow:\s*\/\s*$/im.test(robots)) {
      findings.push('robots.txt must contain User-agent: * and Disallow: /')
    }
  }

  if (names.has('_redirects')) {
    const redirects = await readFile(join(root, '_redirects'), 'utf8')
    if (!/^\/\*\s+\/index\.html\s+200\s*$/m.test(redirects)) {
      findings.push('_redirects must preserve the SPA fallback to /index.html with status 200')
    }
  }

  if (names.has('_headers')) {
    const headers = await readFile(join(root, '_headers'), 'utf8')
    const requiredHeaderFragments = [
      'Content-Security-Policy:',
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy: no-referrer',
      'X-Frame-Options: DENY',
      'X-Robots-Tag: noindex, nofollow',
    ]
    for (const fragment of requiredHeaderFragments) {
      if (!headers.includes(fragment)) findings.push(`_headers is missing ${fragment}`)
    }
    if (/connect-src[^\n]*https:\/\/\*/.test(headers) || /connect-src[^\n]*wss:\/\/\*/.test(headers)) {
      findings.push('_headers connect-src must not use broad https/wss wildcards')
    }
  }

  if (names.has('index.html')) {
    const html = await readFile(join(root, 'index.html'), 'utf8')
    if (!/<meta\s+name=["']robots["'][^>]*noindex/i.test(html)) findings.push('index.html is missing noindex metadata')
    if (!/<meta\s+name=["']referrer["'][^>]*no-referrer/i.test(html)) findings.push('index.html is missing no-referrer metadata')
  }

  return [...new Set(findings)].sort()
}

export async function runReleaseArtifactAudit(root = process.argv[2] ?? 'dist') {
  const findings = await auditReleaseArtifact(root)
  if (findings.length > 0) throw new Error(`Release artifact audit failed:\n- ${findings.join('\n- ')}`)
  return { ok: true }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  runReleaseArtifactAudit()
    .then(() => console.log('Release artifact audit passed.'))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
