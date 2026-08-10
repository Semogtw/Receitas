import assert from 'node:assert/strict'
import test from 'node:test'

import { inspectPwaSource } from './pwa-source-audit.mjs'

const SAFE = `
VitePWA({
  registerType: 'prompt',
  workbox: {
    navigateFallback: '/index.html',
    runtimeCaching: [],
  },
})
`

test('accepts prompt-based PWA updates with no runtime cache', () => {
  assert.deepEqual(inspectPwaSource(SAFE), [])
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
