import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REQUIRED_PROJECTS = [
  'chromium-desktop',
  'firefox-desktop',
  'webkit-desktop',
  'mobile-chrome',
  'mobile-safari',
]

export function inspectPlaywrightConfigs({ localConfig, deployedConfig }) {
  const findings = []

  for (const project of REQUIRED_PROJECTS) {
    if (!localConfig.includes(`name: '${project}'`) && !localConfig.includes(`name: "${project}"`)) {
      findings.push(`release Playwright matrix must include ${project}`)
    }
  }

  if (!localConfig.includes("devices['Desktop Chrome']")) findings.push('Chromium desktop must use the standard Desktop Chrome device profile')
  if (!localConfig.includes("devices['Desktop Firefox']")) findings.push('Firefox desktop must use the standard Desktop Firefox device profile')
  if (!localConfig.includes("devices['Desktop Safari']")) findings.push('WebKit desktop must use the standard Desktop Safari device profile')
  if (!localConfig.includes("devices['Pixel 7']")) findings.push('mobile Chrome must use the Pixel 7 device profile')
  if (!localConfig.includes("devices['iPhone 15']")) findings.push('mobile Safari must use the iPhone 15 device profile')

  if (!localConfig.includes('webServer:')) findings.push('local release Playwright config must keep an explicit preview webServer')
  if (!localConfig.includes('reuseExistingServer: false')) findings.push('local release Playwright config must not silently reuse an unrelated preview server')
  if (!localConfig.includes('forbidOnly: true')) findings.push('local release Playwright config must keep forbidOnly enabled')
  if (!localConfig.includes('retries: 0')) findings.push('local release Playwright config must keep retries disabled so flaky release gates remain visible')

  if (!deployedConfig.includes("from './playwright.config'")) {
    findings.push('deployed Playwright config must reuse the audited release browser matrix')
  }
  if (!deployedConfig.includes('projects: releaseBrowserProjects')) {
    findings.push('deployed Playwright config must run the shared release browser matrix')
  }
  if (/\bwebServer\s*:/.test(deployedConfig)) findings.push('deployed Playwright config must not start a local webServer')
  if (/\bbaseURL\s*:/.test(deployedConfig)) findings.push('deployed Playwright config must not set a local baseURL')
  if (!deployedConfig.includes('forbidOnly: true')) findings.push('deployed Playwright config must keep forbidOnly enabled')
  if (!deployedConfig.includes('retries: 0')) findings.push('deployed Playwright config must keep retries disabled')

  return findings
}

export async function auditPlaywrightConfigs(root = process.cwd()) {
  const [localConfig, deployedConfig] = await Promise.all([
    readFile(join(root, 'playwright.config.ts'), 'utf8'),
    readFile(join(root, 'playwright.deployed.config.ts'), 'utf8'),
  ])
  return inspectPlaywrightConfigs({ localConfig, deployedConfig })
}

export async function runPlaywrightConfigAudit(root = process.cwd()) {
  const findings = await auditPlaywrightConfigs(root)
  if (findings.length > 0) throw new Error(`Playwright config audit failed:\n- ${findings.join('\n- ')}`)
  return { ok: true }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  runPlaywrightConfigAudit()
    .then(() => console.log('Playwright config audit passed.'))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
