import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { auditReleaseArtifact } from './release-artifact-audit.mjs'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'receitas-release-artifact-'))
  await writeFile(join(root, 'index.html'), '<meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer">')
  await writeFile(join(root, 'manifest.webmanifest'), '{}')
  await writeFile(join(root, 'robots.txt'), 'User-agent: *\nDisallow: /\n')
  await writeFile(join(root, '_redirects'), '/* /index.html 200\n')
  await writeFile(join(root, '_headers'), `/*\n  Content-Security-Policy: default-src 'self'; connect-src 'self' https://abc.supabase.co https://sync.example.com wss://sync.example.com\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n  X-Robots-Tag: noindex, nofollow\n`)
  return root
}

test('accepts a complete private static PWA release artifact', async () => {
  assert.deepEqual(await auditReleaseArtifact(await fixture()), [])
})

test('rejects missing deploy control files and manifest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'receitas-release-artifact-'))
  await writeFile(join(root, 'index.html'), '<meta name="robots" content="noindex"><meta name="referrer" content="no-referrer">')
  const findings = await auditReleaseArtifact(root)

  assert(findings.some((finding) => finding.includes('robots.txt')))
  assert(findings.some((finding) => finding.includes('_redirects')))
  assert(findings.some((finding) => finding.includes('_headers')))
  assert(findings.some((finding) => finding.includes('web manifest')))
})

test('rejects broad connect-src wildcards', async () => {
  const root = await fixture()
  await writeFile(join(root, '_headers'), `/*\n  Content-Security-Policy: connect-src 'self' https://* wss://*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n  X-Robots-Tag: noindex, nofollow\n`)

  const findings = await auditReleaseArtifact(root)
  assert(findings.some((finding) => finding.includes('must not use broad')))
})

test('rejects a public robots policy or missing privacy metadata', async () => {
  const root = await fixture()
  await writeFile(join(root, 'robots.txt'), 'User-agent: *\nAllow: /\n')
  await writeFile(join(root, 'index.html'), '<!doctype html>')

  const findings = await auditReleaseArtifact(root)
  assert(findings.some((finding) => finding.includes('Disallow: /')))
  assert(findings.some((finding) => finding.includes('noindex metadata')))
  assert(findings.some((finding) => finding.includes('no-referrer metadata')))
})
