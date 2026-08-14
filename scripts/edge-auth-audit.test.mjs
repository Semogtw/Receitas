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
  `, 'pair-invite', 'supabase/functions/pair-invite/index.ts')

  assert.equal(findings.length, 1)
  assert(findings[0].includes('getRequestUserId()'))
})

test('requires URL import service-role lookup to prove membership is current and activated', () => {
  const secure = `
    const userId = await getRequestUserId(admin, request)
    const membership = await admin.from('pair_members')
      .select('pair_id')
      .eq('user_id', userId)
      .is('removed_at', null)
      .not('activated_at', 'is', null)
      .maybeSingle()
  `
  assert.deepEqual(
    inspectEdgeAuthSource(secure, 'import-url', 'supabase/functions/import-url/index.ts'),
    [],
  )

  const findings = inspectEdgeAuthSource(`
    const userId = await getRequestUserId(admin, request)
    const membership = await admin.from('pair_members')
      .select('pair_id')
      .eq('user_id', userId)
      .maybeSingle()
  `, 'import-url', 'supabase/functions/import-url/index.ts')

  assert(findings.some((finding) => finding.includes('exclude removed')))
  assert(findings.some((finding) => finding.includes('require activated')))
})

test('keeps bootstrap as the only explicit public-by-secret Edge entrypoint', () => {
  assert.deepEqual(
    inspectEdgeAuthSource('const body = await readJsonObject(request)', 'bootstrap', 'supabase/functions/bootstrap/index.ts'),
    [],
  )
})
