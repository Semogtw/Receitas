import assert from 'node:assert/strict'
import test from 'node:test'

import { inspectPwaLifecycleSource, inspectPwaSource } from './pwa-source-audit.mjs'

const SAFE = `
VitePWA({
  registerType: 'prompt',
  workbox: {
    navigateFallback: '/index.html',
    runtimeCaching: [],
  },
})
`

const SAFE_LIFECYCLE = `
const updateApprovedRef = useRef(false)
const { updateServiceWorker } = useRegisterSW({
  onNeedReload() {
    if (updateApprovedRef.current) window.location.reload()
  },
})
async function applyUpdate() {
  updateApprovedRef.current = true
  await updateServiceWorker(true)
}
`

const SAFE_BANNER = `
<p>campos de formulário ainda não salvos podem ser perdidos</p>
<button>Atualizar agora</button>
<button>Depois</button>
`

test('accepts prompt-based PWA updates with no runtime cache', () => {
  assert.deepEqual(inspectPwaSource(SAFE), [])
  assert.deepEqual(inspectPwaLifecycleSource({ lifecycle: SAFE_LIFECYCLE, banner: SAFE_BANNER }), [])
})

test('rejects automatic updates and runtime caching strategies', () => {
  const unsafe = SAFE
    .replace("registerType: 'prompt'", "registerType: 'autoUpdate'")
    .replace('runtimeCaching: []', "runtimeCaching: [{ handler: 'NetworkFirst' }]")

  const findings = inspectPwaSource(unsafe)
  assert(findings.some((finding) => finding.includes('user-prompted')))
  assert(findings.some((finding) => finding.includes('runtimeCaching must remain empty')))
  assert(findings.some((finding) => finding.includes('runtime Workbox caching strategy')))
})

test('rejects explicit production source maps', () => {
  const findings = inspectPwaSource(`${SAFE}\nbuild: { sourcemap: true }`)
  assert(findings.some((finding) => finding.includes('source maps')))
})

test('requires the SPA navigation fallback', () => {
  const findings = inspectPwaSource(SAFE.replace("navigateFallback: '/index.html'", "navigateFallback: '/offline.html'"))
  assert(findings.some((finding) => finding.includes('navigateFallback')))
})

test('rejects lifecycle that can reload without explicit approval', () => {
  const findings = inspectPwaLifecycleSource({
    lifecycle: SAFE_LIFECYCLE.replace(
      'if (updateApprovedRef.current) window.location.reload()',
      'window.location.reload()',
    ),
    banner: SAFE_BANNER,
  })
  assert(findings.some((finding) => finding.includes('conditional on explicit approval')))
})

test('rejects update prompts that hide unsaved-form risk or remove defer action', () => {
  const findings = inspectPwaLifecycleSource({
    lifecycle: SAFE_LIFECYCLE,
    banner: '<button>Atualizar agora</button>',
  })
  assert(findings.some((finding) => finding.includes('unsaved form fields')))
  assert(findings.some((finding) => finding.includes('apply and defer')))
})

test('rejects dropping the reloadPage=true argument from the approved update action', () => {
  const findings = inspectPwaLifecycleSource({
    lifecycle: SAFE_LIFECYCLE.replace('await updateServiceWorker(true)', 'await updateServiceWorker()'),
    banner: SAFE_BANNER,
  })
  assert(findings.some((finding) => finding.includes('updateServiceWorker(true)')))
  assert(findings.some((finding) => finding.includes('must not drop')))
})
