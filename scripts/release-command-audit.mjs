import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REQUIRED_RELEASE_E2E = [
  'tests/e2e/app-shell.spec.ts',
  'tests/e2e/release-acceptance.spec.ts',
  'tests/e2e/offline-recovery.spec.ts',
  'tests/e2e/import.spec.ts',
  'tests/e2e/backup-restore.spec.ts',
  'tests/e2e/diagnostics.spec.ts',
  'tests/e2e/recipes.spec.ts',
  'tests/e2e/cooking.spec.ts',
  'tests/e2e/media.spec.ts',
  'tests/e2e/planner-shopping.spec.ts',
  'tests/e2e/trash-restore.spec.ts',
]

function command(scripts, name) {
  return typeof scripts?.[name] === 'string' ? scripts[name] : ''
}

export function inspectReleaseCommands(packageJson) {
  const findings = []
  const scripts = packageJson?.scripts ?? {}
  const releaseE2e = command(scripts, 'test:e2e:release')
  const verify = command(scripts, 'verify')
  const verifyRelease = command(scripts, 'verify:release')
  const deployed = command(scripts, 'test:e2e:deployed')

  if (!releaseE2e.startsWith('playwright test ')) {
    findings.push('test:e2e:release must execute Playwright directly')
  }
  for (const spec of REQUIRED_RELEASE_E2E) {
    if (!releaseE2e.includes(spec)) findings.push(`test:e2e:release must include ${spec}`)
  }
  if (/\|\|\s*true|--pass-with-no-tests|--no-fail/i.test(releaseE2e)) {
    findings.push('test:e2e:release must remain fail-closed')
  }

  for (const required of ['pnpm lint', 'pnpm typecheck', 'pnpm test:run', 'pnpm test:release-scripts', 'pnpm verify:source', 'pnpm verify:edge', 'pnpm build:pages', 'pnpm test:e2e:smoke']) {
    if (!verify.includes(required)) findings.push(`verify must include ${required}`)
  }
  if (!verifyRelease.includes('pnpm verify') || !verifyRelease.includes('pnpm test:e2e:release')) {
    findings.push('verify:release must compose verify and the authenticated release E2E suite')
  }
  if (!deployed.includes('tests/e2e/deployed-security.spec.ts')) {
    findings.push('test:e2e:deployed must keep origin security/deep-link checks')
  }

  return findings
}

export async function auditReleaseCommands(root = process.cwd()) {
  const raw = await readFile(join(root, 'package.json'), 'utf8')
  return inspectReleaseCommands(JSON.parse(raw))
}

export async function runReleaseCommandAudit(root = process.cwd()) {
  const findings = await auditReleaseCommands(root)
  if (findings.length > 0) throw new Error(`Release command audit failed:\n- ${findings.join('\n- ')}`)
  return { ok: true }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  runReleaseCommandAudit()
    .then(() => console.log('Release command audit passed.'))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
