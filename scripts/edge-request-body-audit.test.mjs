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

test('ignores raw-reader examples that exist only in comments or strings', () => {
  assert.deepEqual(
    inspectEdgeRequestBodySource(`
      // await request.text()
      /* request.body?.getReader() */
      const single = 'request.json()'
      const double = "request.formData()"
      const template = \`request.blob()\`
      const body = await readJsonObject(request)
    `, 'supabase/functions/example/index.ts'),
    [],
  )
})

test('does not mistake URL slashes for comments before a direct body read', () => {
  const findings = inspectEdgeRequestBodySource(`
    const endpoint = 'https://example.invalid/path'
    const body = await request.text()
  `, 'supabase/functions/example/index.ts')

  assert(findings.some((finding) => finding.includes('request.text()')))
})

test('audits executable code inside template interpolation', () => {
  const findings = inspectEdgeRequestBodySource(
    'const diagnostic = `body=${await request.text()}`',
    'supabase/functions/example/index.ts',
  )

  assert(findings.some((finding) => finding.includes('request.text()')))
})
