import assert from 'node:assert/strict'
import test from 'node:test'

import {
  inspectMediaBucketSource,
  inspectMigrationSequence,
  inspectPrivatePrivilegeSql,
  inspectSupabaseConfig,
} from './source-security-audit.mjs'

const SECURE_CONFIG = `
[auth]
enable_signup = false
enable_anonymous_sign_ins = false
minimum_password_length = 12

[auth.email]
enable_signup = false

[storage.buckets.recipe-media]
public = false

[functions.bootstrap]
verify_jwt = false

[functions.pair-invite]
verify_jwt = true

[functions.import-url]
verify_jwt = true

[functions.backup-restore]
verify_jwt = true

[functions.account-admin]
verify_jwt = true

[functions.permanent-delete]
verify_jwt = true
`

test('accepts the intended closed two-person auth and private storage config', () => {
  assert.deepEqual(inspectSupabaseConfig(SECURE_CONFIG), [])
})

test('rejects reopened signup, weak passwords, public media and missing JWT gates', () => {
  const insecure = SECURE_CONFIG
    .replace('enable_signup = false', 'enable_signup = true')
    .replace('minimum_password_length = 12', 'minimum_password_length = 8')
    .replace('public = false', 'public = true')
    .replace('[functions.account-admin]\nverify_jwt = true', '[functions.account-admin]\nverify_jwt = false')

  const findings = inspectSupabaseConfig(insecure)
  assert(findings.some((finding) => finding.includes('auth.enable_signup')))
  assert(findings.some((finding) => finding.includes('minimum_password_length')))
  assert(findings.some((finding) => finding.includes('bucket must remain private')))
  assert(findings.some((finding) => finding.includes('account-admin')))
})

test('rejects a permanent-delete Edge Function without JWT verification', () => {
  const findings = inspectSupabaseConfig(
    SECURE_CONFIG.replace('[functions.permanent-delete]\nverify_jwt = true', '[functions.permanent-delete]\nverify_jwt = false'),
  )
  assert(findings.some((finding) => finding.includes('permanent-delete')))
})

test('rejects the historical underscore media bucket typo', () => {
  const findings = inspectSupabaseConfig(
    SECURE_CONFIG.replace('[storage.buckets.recipe-media]', '[storage.buckets.recipe_media]'),
  )
  assert(findings.some((finding) => finding.includes('recipe-media bucket')))
})

test('requires the canonical media bucket across frontend, restore and migration source', () => {
  const secureSources = {
    mediaConfig: "export const MEDIA_STORAGE_BUCKET = 'recipe-media'",
    restoreCommit: "const RECIPE_MEDIA_BUCKET = 'recipe-media'",
    storageMigration: "values ('recipe-media'); create policy p on storage.objects using (bucket_id = 'recipe-media');",
  }
  assert.deepEqual(inspectMediaBucketSource(secureSources), [])

  const drifted = inspectMediaBucketSource({
    ...secureSources,
    restoreCommit: "const RECIPE_MEDIA_BUCKET = 'recipe_media'",
  })
  assert(drifted.some((finding) => finding.includes('restore media bucket')))
  assert(drifted.some((finding) => finding.includes('underscore recipe_media')))
})

test('requires the bootstrap JWT exception to stay explicit rather than silently drifting', () => {
  const findings = inspectSupabaseConfig(SECURE_CONFIG.replace('[functions.bootstrap]\nverify_jwt = false', '[functions.bootstrap]\nverify_jwt = true'))
  assert(findings.some((finding) => finding.includes('bootstrap JWT exception')))
})

test('accepts contiguous numbered migrations', () => {
  assert.deepEqual(inspectMigrationSequence([
    '0001_core.sql',
    '0002_domain.sql',
    '0003_more.sql',
  ]), [])
})

test('rejects gaps and duplicate migration numbers', () => {
  const findings = inspectMigrationSequence([
    '0001_core.sql',
    '0003_more.sql',
    '0003_duplicate.sql',
  ])

  assert(findings.some((finding) => finding.includes('missing migration number 0002')))
  assert(findings.some((finding) => finding.includes('duplicate migration number 0003')))
})

test('rejects browser-role access to the private schema or private functions', () => {
  assert.deepEqual(inspectPrivatePrivilegeSql(`
    revoke all on schema private from public, anon, authenticated;
    revoke all on function private.secret(uuid) from public, anon, authenticated;
    grant execute on function private.secret(uuid) to service_role;
  `), [])

  const schemaFindings = inspectPrivatePrivilegeSql(
    'GRANT USAGE ON SCHEMA private TO authenticated;',
    '0031_bad_schema.sql',
  )
  assert(schemaFindings.some((finding) => finding.includes('private schema USAGE')))

  const functionFindings = inspectPrivatePrivilegeSql(
    'grant execute on function private.secret(uuid) to anon;',
    '0032_bad_function.sql',
  )
  assert(functionFindings.some((finding) => finding.includes('private function EXECUTE')))
})

test('ignores unsafe-looking privilege text inside SQL comments', () => {
  assert.deepEqual(inspectPrivatePrivilegeSql(`
    -- grant usage on schema private to authenticated;
    /* grant execute on function private.secret(uuid) to anon; */
    revoke all on schema private from public, anon, authenticated;
  `), [])
})
