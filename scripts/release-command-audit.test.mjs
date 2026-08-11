import assert from 'node:assert/strict'
import test from 'node:test'

import { inspectReleaseCommands } from './release-command-audit.mjs'

function securePackage() {
  return {
    scripts: {
      verify: 'pnpm lint && pnpm typecheck && pnpm test:run && pnpm test:release-scripts && pnpm verify:source && pnpm verify:edge && pnpm build:pages && pnpm test:e2e:smoke',
      'verify:release': 'pnpm verify && pnpm test:e2e:release',
      'test:e2e:release': 'playwright test tests/e2e/app-shell.spec.ts tests/e2e/release-acceptance.spec.ts tests/e2e/offline-recovery.spec.ts tests/e2e/pwa-update.spec.ts tests/e2e/import.spec.ts tests/e2e/backup-restore.spec.ts tests/e2e/diagnostics.spec.ts tests/e2e/recipes.spec.ts tests/e2e/cooking.spec.ts tests/e2e/media.spec.ts tests/e2e/planner-shopping.spec.ts tests/e2e/trash-restore.spec.ts tests/e2e/conflicts.spec.ts tests/e2e/accessibility-layout.spec.ts',
      'test:e2e:deployed': 'playwright test tests/e2e/deployed-security.spec.ts',
    },
  }
}

test('accepts the complete fail-closed release command graph', () => {
  assert.deepEqual(inspectReleaseCommands(securePackage()), [])
})

test('rejects a release suite that silently drops core product journeys', () => {
  const packageJson = securePackage()
  packageJson.scripts['test:e2e:release'] = 'playwright test tests/e2e/app-shell.spec.ts tests/e2e/release-acceptance.spec.ts'

  const findings = inspectReleaseCommands(packageJson)
  for (const spec of ['offline-recovery.spec.ts', 'pwa-update.spec.ts', 'recipes.spec.ts', 'cooking.spec.ts', 'media.spec.ts', 'planner-shopping.spec.ts', 'trash-restore.spec.ts', 'conflicts.spec.ts', 'accessibility-layout.spec.ts']) {
    assert(findings.some((finding) => finding.includes(spec)))
  }
})

test('rejects fail-open E2E commands and incomplete top-level release composition', () => {
  const packageJson = securePackage()
  packageJson.scripts['test:e2e:release'] += ' || true'
  packageJson.scripts['verify:release'] = 'pnpm verify'

  const findings = inspectReleaseCommands(packageJson)
  assert(findings.some((finding) => finding.includes('fail-closed')))
  assert(findings.some((finding) => finding.includes('verify:release')))
})

test('rejects verify when an executable gate disappears', () => {
  const packageJson = securePackage()
  packageJson.scripts.verify = packageJson.scripts.verify.replace(' && pnpm verify:edge', '')

  const findings = inspectReleaseCommands(packageJson)
  assert(findings.some((finding) => finding.includes('pnpm verify:edge')))
})
