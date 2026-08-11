import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  assertCloudflareHeaderLimits,
  buildPagesHeaders,
  CLOUDFLARE_HEADER_VALUE_LIMIT,
  resolveReleasePublicEnv,
} from './generate-pages-headers.mjs'

const INPUT = {
  supabaseUrl: 'https://abc.supabase.co',
  powersyncUrl: 'https://example.powersync.journeyapps.com',
}

test('uses exact Supabase and PowerSync origins without broad https wildcards', () => {
  const headers = buildPagesHeaders(INPUT)

  assert.match(headers, /connect-src 'self' https:\/\/abc\.supabase\.co https:\/\/example\.powersync\.journeyapps\.com wss:\/\/example\.powersync\.journeyapps\.com/)
  assert.match(headers, /img-src 'self' data: blob: https:\/\/abc\.supabase\.co/)
  assert(!headers.includes('https://*'))
  assert(!headers.includes('wss://*'))
})

test('includes the release privacy and framing headers with unused browser capabilities denied', () => {
  const headers = buildPagesHeaders(INPUT)

  assert(headers.includes('X-Content-Type-Options: nosniff'))
  assert(headers.includes('Referrer-Policy: no-referrer'))
  assert(headers.includes('X-Frame-Options: DENY'))
  assert(headers.includes('X-Robots-Tag: noindex, nofollow'))
  assert(headers.includes('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()'))
  assert(!headers.includes('camera=(self)'))
})

test('only emits HSTS for production release output', () => {
  assert(!buildPagesHeaders({ ...INPUT, releaseEnv: 'preview' }).includes('Strict-Transport-Security'))
  assert(buildPagesHeaders({ ...INPUT, releaseEnv: 'production' }).includes('Strict-Transport-Security: max-age=31536000; includeSubDomains'))
})

test('rejects non-https or non-origin endpoint values', () => {
  assert.throws(() => buildPagesHeaders({ ...INPUT, supabaseUrl: 'http://abc.supabase.co' }), /must use https/)
  assert.throws(() => buildPagesHeaders({ ...INPUT, powersyncUrl: 'https://example.powersync.journeyapps.com/path' }), /only an origin/)
  assert.throws(() => buildPagesHeaders({ ...INPUT, powersyncUrl: 'https://user:pass@example.invalid' }), /must not contain URL credentials/)
})

test('rejects generated header values larger than the Cloudflare Pages limit', () => {
  const allowed = `/*\n  X-Test: ${'x'.repeat(CLOUDFLARE_HEADER_VALUE_LIMIT)}\n`
  assert.doesNotThrow(() => assertCloudflareHeaderLimits(allowed))

  const oversized = `/*\n  X-Test: ${'x'.repeat(CLOUDFLARE_HEADER_VALUE_LIMIT + 1)}\n`
  assert.throws(
    () => assertCloudflareHeaderLimits(oversized),
    /X-Test exceeds Cloudflare Pages header value limit/,
  )
})

test('resolves only public release endpoints with Vite production precedence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'receitas-release-env-'))
  await writeFile(join(root, '.env'), [
    'VITE_SUPABASE_URL=https://base.supabase.co',
    'VITE_POWERSYNC_URL=https://base.powersync.example.com',
    'SUPABASE_SERVICE_ROLE_KEY=must-never-be-read',
  ].join('\n'))
  await writeFile(join(root, '.env.production'), 'VITE_SUPABASE_URL=https://prod.supabase.co\n')
  await writeFile(join(root, '.env.production.local'), 'VITE_POWERSYNC_URL="https://local.powersync.example.com"\n')

  const resolved = await resolveReleasePublicEnv({ root, env: {} })
  assert.deepEqual(resolved, {
    VITE_SUPABASE_URL: 'https://prod.supabase.co',
    VITE_POWERSYNC_URL: 'https://local.powersync.example.com',
  })
  assert.equal('SUPABASE_SERVICE_ROLE_KEY' in resolved, false)
})

test('exported environment variables override Vite env files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'receitas-release-env-'))
  await writeFile(join(root, '.env.production'), [
    'VITE_SUPABASE_URL=https://file.supabase.co',
    'VITE_POWERSYNC_URL=https://file.powersync.example.com',
  ].join('\n'))

  const resolved = await resolveReleasePublicEnv({
    root,
    env: {
      VITE_SUPABASE_URL: 'https://shell.supabase.co',
      VITE_POWERSYNC_URL: 'https://shell.powersync.example.com',
    },
  })
  assert.equal(resolved.VITE_SUPABASE_URL, 'https://shell.supabase.co')
  assert.equal(resolved.VITE_POWERSYNC_URL, 'https://shell.powersync.example.com')
})
