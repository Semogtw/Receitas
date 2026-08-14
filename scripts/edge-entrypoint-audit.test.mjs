import assert from 'node:assert/strict'
import test from 'node:test'

import { inspectEdgeEntrypointSource } from './edge-entrypoint-audit.mjs'

test('accepts a single Deno.serve guarded by import.meta.main', () => {
  assert.deepEqual(inspectEdgeEntrypointSource(`
    const handler = () => new Response('ok')
    if (import.meta.main) Deno.serve(handler)
  `), [])
})

test('rejects an unguarded production server', () => {
  const findings = inspectEdgeEntrypointSource(`
    const handler = () => new Response('ok')
    Deno.serve(handler)
  `, 'supabase/functions/example/index.ts')

  assert.equal(findings.length, 1)
  assert.match(findings[0], /must be guarded/)
})

test('ignores Deno.serve text in comments and strings', () => {
  assert.deepEqual(inspectEdgeEntrypointSource(`
    // Deno.serve(fake)
    const example = 'Deno.serve(fake)'
    if (import.meta.main) Deno.serve(handler)
  `), [])
})

test('rejects multiple executable Deno.serve calls even when one is guarded', () => {
  const findings = inspectEdgeEntrypointSource(`
    if (import.meta.main) Deno.serve(handler)
    if (debugMode) Deno.serve(debugHandler)
  `)

  assert.equal(findings.length, 1)
  assert.match(findings[0], /exactly one/)
})

test('rejects an entrypoint that no longer starts a production server', () => {
  const findings = inspectEdgeEntrypointSource('export const handler = () => new Response()')

  assert.equal(findings.length, 1)
  assert.match(findings[0], /must start its production server/)
})
