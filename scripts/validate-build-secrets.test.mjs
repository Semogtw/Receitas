import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { validateBuildSecrets } from './validate-build-secrets.mjs'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'receitas-build-secrets-'))
  await mkdir(join(root, 'assets'))
  await writeFile(join(root, 'index.html'), '<!doctype html><script src="/assets/app.js"></script>')
  await writeFile(join(root, 'assets', 'app.js'), 'console.log("ok")')
  return root
}

test('accepts a minimal browser artifact without privileged material', async () => {
  const root = await fixture()
  assert.deepEqual(await validateBuildSecrets(root, {}), [])
})

test('rejects privileged variable markers and service_role claims', async () => {
  const root = await fixture()
  await writeFile(join(root, 'assets', 'app.js'), [
    'const key = "SUPABASE_SERVICE_ROLE_KEY"',
    'const claim = {"role":"service_role"}',
  ].join('\n'))

  const findings = await validateBuildSecrets(root, {})
  assert(findings.some((finding) => finding.includes('SUPABASE_SERVICE_ROLE_KEY')))
  assert(findings.some((finding) => finding.includes('service_role claim')))
})

test('rejects configured test secret values when they leak into emitted assets', async () => {
  const root = await fixture()
  await writeFile(join(root, 'assets', 'app.js'), 'const leaked = "fixture-password-123"')

  const findings = await validateBuildSecrets(root, { E2E_PASSWORD: 'fixture-password-123' })
  assert(findings.some((finding) => finding.includes('E2E_PASSWORD')))
})

test('rejects source maps and sensitive-looking files', async () => {
  const root = await fixture()
  await writeFile(join(root, 'assets', 'app.js.map'), '{}')
  await writeFile(join(root, '.env.production'), 'VITE_PUBLIC=value')
  await writeFile(join(root, 'deploy.key'), 'fixture')

  const findings = await validateBuildSecrets(root, {})
  assert(findings.some((finding) => finding.includes('source map shipped')))
  assert.equal(findings.filter((finding) => finding.includes('sensitive-looking file shipped')).length, 2)
})
