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

export function inspectPwaLifecycleSource({ lifecycle, banner }) {
  const findings = []

  if (!lifecycle.includes('useRegisterSW({')) {
    findings.push('PWA lifecycle must register through the prompt-aware React hook')
  }
  if (!lifecycle.includes('updateApprovedRef.current = true')) {
    findings.push('PWA update action must record explicit user approval before activation')
  }
  if (!lifecycle.includes('if (updateApprovedRef.current) window.location.reload()')) {
    findings.push('PWA reload must remain conditional on explicit approval in this tab')
  }
  if (!/await\s+updateServiceWorker\s*\(\s*true\s*\)/.test(lifecycle)) {
    findings.push('PWA update action must request activation/reload with updateServiceWorker(true) after explicit approval')
  }
  if (/await\s+updateServiceWorker\s*\(\s*\)/.test(lifecycle)) {
    findings.push('PWA update action must not drop the reloadPage=true argument required by the current React integration contract')
  }
  if (!banner.includes('campos de formulário ainda não salvos podem ser perdidos')) {
    findings.push('PWA update prompt must warn about unsaved form fields before reload')
  }
  if (!banner.includes('Atualizar agora') || !banner.includes('Depois')) {
    findings.push('PWA update prompt must offer explicit apply and defer actions')
  }

  return findings
}

export async function auditPwaSource(root = process.cwd()) {
  const [viteConfig, lifecycle, banner] = await Promise.all([
    readFile(join(root, 'vite.config.ts'), 'utf8').catch(() => null),
    readFile(join(root, 'src', 'app', 'PwaLifecycle.tsx'), 'utf8').catch(() => null),
    readFile(join(root, 'src', 'app', 'PwaStatusBanner.tsx'), 'utf8').catch(() => null),
  ])

  const findings = []
  if (viteConfig === null) findings.push('vite.config.ts is missing')
  else findings.push(...inspectPwaSource(viteConfig))

  if (lifecycle === null) findings.push('src/app/PwaLifecycle.tsx is missing')
  if (banner === null) findings.push('src/app/PwaStatusBanner.tsx is missing')
  if (lifecycle !== null && banner !== null) findings.push(...inspectPwaLifecycleSource({ lifecycle, banner }))

  return findings
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
