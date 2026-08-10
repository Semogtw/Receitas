import assert from 'node:assert/strict'
import test from 'node:test'

import { inspectUiIntegration } from './ui-integration-audit.mjs'

const SAFE = {
  router: `
import { ReplacementCompletionScreen } from '../features/auth/ReplacementCompletionScreen'
const routes = [
  { path: '/auth/finish-replacement', Component: ReplacementCompletionScreen },
  { path: '/', element: <AuthGate><AppShell /></AuthGate> },
]
`,
  settings: `
<CompleteRestorePanel database={database} />
<ReplaceRestorePanel database={database} />
<AccountAdminScreen database={database} />
`,
  main: `
import './styles/cooking.css'
import './styles/media.css'
import './styles/account-admin.css'
`,
}

test('accepts the release-critical restore and recovery integration', () => {
  assert.deepEqual(inspectUiIntegration(SAFE), [])
})

test('rejects replacement completion placed behind AuthGate', () => {
  const router = `
const routes = [
  { path: '/', element: <AuthGate><AppShell /></AuthGate> },
  { path: '/auth/finish-replacement', Component: ReplacementCompletionScreen },
]
`
  const findings = inspectUiIntegration({ ...SAFE, router })
  assert(findings.some((finding) => finding.includes('outside AuthGate')))
})

test('rejects restore or account recovery components becoming unreachable', () => {
  const findings = inspectUiIntegration({ ...SAFE, settings: '<CompleteRestorePanel database={database} />' })
  assert(findings.some((finding) => finding.includes('ReplaceRestorePanel')))
  assert(findings.some((finding) => finding.includes('AccountAdminScreen')))
})

test('rejects release-critical styles disappearing from the bundle', () => {
  const findings = inspectUiIntegration({ ...SAFE, main: "import './styles/cooking.css'" })
  assert(findings.some((finding) => finding.includes('./styles/media.css')))
  assert(findings.some((finding) => finding.includes('./styles/account-admin.css')))
})
