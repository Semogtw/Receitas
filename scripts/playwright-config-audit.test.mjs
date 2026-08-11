import assert from 'node:assert/strict'
import test from 'node:test'

import { inspectPlaywrightConfigs } from './playwright-config-audit.mjs'

const LOCAL = `
import { devices } from '@playwright/test'
export const releaseBrowserProjects = [
  { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
  { name: 'firefox-desktop', use: { ...devices['Desktop Firefox'] } },
  { name: 'webkit-desktop', use: { ...devices['Desktop Safari'] } },
  { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  { name: 'mobile-safari', use: { ...devices['iPhone 15'] } },
]
export default {
  forbidOnly: true,
  retries: 0,
  webServer: { reuseExistingServer: false },
}
`

const DEPLOYED = `
import { releaseBrowserProjects } from './playwright.config'
export default {
  forbidOnly: true,
  retries: 0,
  projects: releaseBrowserProjects,
}
`

test('accepts the required release matrix and isolated deployed config', () => {
  assert.deepEqual(inspectPlaywrightConfigs({ localConfig: LOCAL, deployedConfig: DEPLOYED }), [])
})

test('rejects removal of Firefox and mobile Safari from the release matrix', () => {
  const localConfig = LOCAL
    .replace("{ name: 'firefox-desktop', use: { ...devices['Desktop Firefox'] } },", '')
    .replace("{ name: 'mobile-safari', use: { ...devices['iPhone 15'] } },", '')

  const findings = inspectPlaywrightConfigs({ localConfig, deployedConfig: DEPLOYED })
  assert(findings.some((finding) => finding.includes('firefox-desktop')))
  assert(findings.some((finding) => finding.includes('Desktop Firefox')))
  assert(findings.some((finding) => finding.includes('mobile-safari')))
  assert(findings.some((finding) => finding.includes('iPhone 15')))
})

test('rejects a deployed config that starts a local server or base URL', () => {
  const deployedConfig = `${DEPLOYED}\nconst accidental = { webServer: {}, baseURL: 'http://127.0.0.1:4173' }\n`
  const findings = inspectPlaywrightConfigs({ localConfig: LOCAL, deployedConfig })

  assert(findings.some((finding) => finding.includes('must not start a local webServer')))
  assert(findings.some((finding) => finding.includes('must not set a local baseURL')))
})

test('rejects relaxed release execution semantics', () => {
  const findings = inspectPlaywrightConfigs({
    localConfig: LOCAL.replace('forbidOnly: true', 'forbidOnly: false').replace('retries: 0', 'retries: 2'),
    deployedConfig: DEPLOYED.replace('forbidOnly: true', 'forbidOnly: false').replace('retries: 0', 'retries: 1'),
  })

  assert(findings.filter((finding) => finding.includes('forbidOnly')).length >= 2)
  assert(findings.filter((finding) => finding.includes('retries')).length >= 2)
})
