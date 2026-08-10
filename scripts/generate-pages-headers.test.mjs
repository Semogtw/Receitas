import assert from 'node:assert/strict'
import test from 'node:test'

import { buildPagesHeaders } from './generate-pages-headers.mjs'

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

test('includes the release privacy and framing headers', () => {
  const headers = buildPagesHeaders(INPUT)

  assert(headers.includes('X-Content-Type-Options: nosniff'))
  assert(headers.includes('Referrer-Policy: no-referrer'))
  assert(headers.includes('X-Frame-Options: DENY'))
  assert(headers.includes('X-Robots-Tag: noindex, nofollow'))
  assert(headers.includes('Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=(), usb=()'))
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
