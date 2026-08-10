import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export function inspectPwaSource(content) {
  const findings = []

  if (!/registerType\s*:\s*['"]prompt['"]/.test(content)) {
    findings.push('PWA updates must remain user-prompted; registerType must be prompt')
  }

  if (!/runtimeCaching\s*:\s*\[\s*\]/s.test(content)) {
    findings.push('Workbox runtimeCaching must remain empty to avoid caching private runtime data')
  }

  if (!/navigateFallback\s*:\s*['"]\/index\.html['"]/.test(content)) {
    findings.push('PWA navigateFallback must remain /index.html')
  }

  if (/\bsourcemap\s*:\s*true\b/.test(content)) {
    findings.push('production source maps must not be explicitly enabled')
  }

  if (/\b(?:CacheFirst|NetworkFirst|StaleWhileRevalidate)\b/.test(content)) {
    findings.push('runtime Workbox caching strategy detected; private app data must not be runtime-cached')
  }

  return findings
}

export async function auditPwaSource(root = process.cwd()) {
  const viteConfig = await readFile(join(root, 'vite.config.ts'), 'utf8').catch(() => null)
  if (viteConfig === null) return ['vite.config.ts is missing']
  return inspectPwaSource(viteConfig)
}

export async function runPwaSourceAudit(root = process.cwd()) {
  const findings = await auditPwaSource(root)
  if (findings.length > 0) {
    throw new Error(`PWA source audit failed:\n- ${findings.join('\n- ')}`)
  }
  return { ok: true }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  runPwaSourceAudit()
    .then(() => console.log('PWA source audit passed.'))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
