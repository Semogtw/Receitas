import assert from 'node:assert/strict'
import test from 'node:test'

import { inspectEdgeAuthSource } from './edge-auth-audit.mjs'

test('accepts protected Edge entrypoints that resolve the authenticated user', () => {
  assert.deepEqual(
    inspectEdgeAuthSource(`
      import { getRequestUserId } from '../_shared/server.ts'
      const userId = await getRequestUserId(request)
    `, 'pair-invite', 'supabase/functions/pair-invite/index.ts'),
    [],
  )
})

test('rejects protected Edge entrypoints without getRequestUserId()', () => {
  const findings = inspectEdgeAuthSource(`
    const admin = getAdminClient()
    const body = await readJsonObject(request)
  `, 'pair-invite', 'supabase/functions/pair-invite/index.ts')

  assert(findings.some((finding) => finding.includes('getRequestUserId()')))
})

test('does not accept auth calls that exist only in comments or strings', () => {
  const findings = inspectEdgeAuthSource(`
    // await getRequestUserId(request)
    const note = 'getRequestUserId(request)'
    const body = await readJsonObject(request)
  `, 'import-url', 'supabase/functions/import-url/index.ts')

  assert.equal(findings.length, 1)
})

test('keeps bootstrap as the only explicit public-by-secret Edge entrypoint', () => {
  assert.deepEqual(
    inspectEdgeAuthSource('const body = await readJsonObject(request)', 'bootstrap', 'supabase/functions/bootstrap/index.ts'),
    [],
  )
})
