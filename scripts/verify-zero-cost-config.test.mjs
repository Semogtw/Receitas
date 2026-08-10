import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { inspectZeroCostText, verifyZeroCostConfig } from './verify-zero-cost-config.mjs'

test('accepts free-tier configuration markers', () => {
  const findings = inspectZeroCostText([
    'SUPABASE_PLAN=free',
    'POWERSYNC_PLAN=free',
    'CLOUDFLARE_PLAN=free',
    'RECURRING_COST_USD=0',
  ].join('\n'))

  assert.deepEqual(findings, [])
})

test('rejects known paid plan flags', () => {
  assert.equal(inspectZeroCostText('SUPABASE_PLAN=pro').length, 1)
  assert.equal(inspectZeroCostText('POWERSYNC_PLAN: team').length, 1)
  assert.equal(inspectZeroCostText('CLOUDFLARE_PLAN="business"').length, 1)
  assert.equal(inspectZeroCostText('VERCEL_PRO=true').length, 1)
  assert.equal(inspectZeroCostText('RECURRING_COST_USD=5').length, 1)
})

test('rejects root Pages Functions because the frontend release is static-only', async () => {
  const root = await mkdtemp(join(tmpdir(), 'receitas-zero-cost-'))
  await mkdir(join(root, 'functions'))
  await writeFile(join(root, 'package.json'), '{"name":"fixture"}')

  const findings = await verifyZeroCostConfig(root)
  assert(findings.some((finding) => finding.includes('Pages Functions')))
})

test('ignores prose and only evaluates assignment-like paid flags', () => {
  const findings = inspectZeroCostText('The release checklist says Supabase Pro must never be enabled.')
  assert.deepEqual(findings, [])
})
