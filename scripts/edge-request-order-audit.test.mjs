import assert from 'node:assert/strict'
import test from 'node:test'

import { inspectEdgeRequestOrderSource } from './edge-request-order-audit.mjs'

test('accepts bounded JSON parsing before privileged client and auth work', () => {
  assert.deepEqual(inspectEdgeRequestOrderSource(`
    const body = await readJsonObject(request, 8192)
    const admin = getClient()
    const userId = await getUserId(request)
    return body.action + userId + admin
  `), [])
})

test('rejects privileged client creation before bounded JSON parsing', () => {
  const findings = inspectEdgeRequestOrderSource(`
    const admin = createServerClient()
    const body = await readJsonObject(request, 8192)
    return { admin, body }
  `, 'supabase/functions/example/index.ts')

  assert.equal(findings.length, 1)
  assert.match(findings[0], /bounded JSON parsing must happen before privileged/)
})

test('rejects authenticated user lookup before bounded JSON parsing', () => {
  const findings = inspectEdgeRequestOrderSource(`
    const userId = await getUserId(request)
    const body = await readBoundedJsonObject(request, 8192)
    return { userId, body }
  `)

  assert.equal(findings.length, 1)
})

test('ignores privileged call text in comments and strings', () => {
  assert.deepEqual(inspectEdgeRequestOrderSource(`
    // getAdminClient()
    const example = 'getClient()'
    const body = await readJsonObject(request)
    const admin = getClient()
    return { body, admin, example }
  `), [])
})

test('does not impose body ordering on entrypoints without JSON bodies', () => {
  assert.deepEqual(inspectEdgeRequestOrderSource(`
    const admin = getAdminClient()
    return admin.rpc('healthcheck')
  `), [])
})
