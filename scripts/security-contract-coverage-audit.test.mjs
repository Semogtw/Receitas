import assert from 'node:assert/strict'
import test from 'node:test'

import {
  inspectSecurityContractCoverage,
  REQUIRED_SECURITY_CONTRACTS,
} from './security-contract-coverage-audit.mjs'

function completeFixture() {
  return Object.fromEntries(
    Object.entries(REQUIRED_SECURITY_CONTRACTS).map(([path, markers]) => [path, markers.join('\n')]),
  )
}

test('accepts the complete authorization and restore security contract set', () => {
  assert.deepEqual(inspectSecurityContractCoverage(completeFixture()), [])
})

test('rejects a deleted critical security contract file', () => {
  const files = completeFixture()
  delete files['supabase/tests/sync_cross_pair_security.sql']

  const findings = inspectSecurityContractCoverage(files)
  assert(findings.some((finding) => finding.includes('sync_cross_pair_security.sql')))
  assert(findings.some((finding) => finding.includes('missing')))
})

test('rejects a security contract that keeps its file but drops an invariant', () => {
  const files = completeFixture()
  files['supabase/tests/storage_rls.sql'] = 'active member cannot read media from another pair namespace'

  const findings = inspectSecurityContractCoverage(files)
  assert(findings.some((finding) => finding.includes('storage_rls.sql')))
  assert(findings.some((finding) => finding.includes('cannot upload media into another pair namespace')))
})

test('requires row locking around invite consumption and pair activation', () => {
  const files = completeFixture()
  files['supabase/migrations/0001_core_identity.sql'] = 'select invite without locking'

  const findings = inspectSecurityContractCoverage(files)
  assert(findings.filter((finding) => finding.includes('0001_core_identity.sql')).length >= 2)
})
