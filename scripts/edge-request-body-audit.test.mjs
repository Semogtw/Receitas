import assert from 'node:assert/strict'
import test from 'node:test'

import { inspectEdgeRequestBodySource } from './edge-request-body-audit.mjs'

test('accepts Edge entrypoints that delegate JSON reads to the bounded shared helper', () => {
  assert.deepEqual(
    inspectEdgeRequestBodySource(`
      import { readJsonObject } from '../_shared/http.ts'
      const body = await readJsonObject(request, 8 * 1024)
    `, 'supabase/functions/import-url/index.ts'),
    [],
  )
})

test('rejects direct Request body readers in Edge entrypoints', () => {
  const samples = [
    'await request.json()',
    'await request.text()',
    'await request.arrayBuffer()',
    'await request.blob()',
    'await request.formData()',
    'request.body?.getReader()',
  ]

  for (const source of samples) {
    const findings = inspectEdgeRequestBodySource(source, 'supabase/functions/example/index.ts')
    assert(findings.length > 0, `${source} must be rejected`)
  }
})

test('ignores raw-reader examples that exist only in comments', () => {
  assert.deepEqual(
    inspectEdgeRequestBodySource(`
      // await request.text()
      /* request.body?.getReader() */
      const body = await readJsonObject(request)
    `, 'supabase/functions/example/index.ts'),
    [],
  )
})
