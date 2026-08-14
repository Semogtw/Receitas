import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const REQUIRED_SECURITY_CONTRACTS = {
  'supabase/tests/domain_rls.sql': [
    'member cannot read another pair recipe',
    'cross-pair recipe/category association is rejected',
  ],
  'supabase/tests/storage_rls.sql': [
    'active member cannot read media from another pair namespace',
    'active member cannot upload media into another pair namespace',
    'active member can read content-addressed media restored into its own pair',
    'active member cannot read restored media from another pair',
  ],
  'supabase/tests/identity_rls.sql': [
    'second bootstrap attempt is rejected',
    'third pending/current seat cannot be inserted while invite is pending',
    'an unrelated verified identity cannot consume the reserved second seat',
  ],
  'supabase/tests/identity_idempotency.sql': [
    'repeating pair invite acceptance after success is idempotent',
  ],
  'supabase/migrations/0001_core_identity.sql': [
    'from public.pair_invites pi where pi.token_hash = invite_token_hash for update;',
    "from public.pairs p where p.id = invite_row.pair_id and p.status = 'open_for_second_member' for update;",
  ],
  'supabase/tests/account_admin_recovery_contract.sql': [
    'authenticated must not execute account_admin_remove_other directly',
    'authenticated must not read private recovery target status directly',
  ],
  'supabase/tests/account_admin_replacement_verification.sql': [
    'unconfirmed replacement cannot activate membership',
    'confirmed invited replacement activates membership',
    'replacement completion keeps the private pair closed',
  ],
  'supabase/tests/account_admin_cancel_cleanup_contract.sql': [
    'cancel removes unactivated replacement membership before external auth cleanup',
    'cancel records replacement auth cleanup before leaving database transaction',
    'server cleanup acknowledgement clears replacement auth cleanup queue',
  ],
  'supabase/tests/sync_cross_pair_security.sql': [
    'semantic mutation cannot target a pair the authenticated user does not belong to',
    'semantic mutation cannot smuggle another pair id through the payload',
  ],
  'supabase/tests/restore_security_contract.sql': [
    'browser roles must not have USAGE on private schema',
    'authenticated must not read private restore tables directly',
    'restore-staging bucket must remain private',
  ],
  'supabase/functions/backup-restore/validation.test.ts': [
    'restore manifest cannot introduce identity or membership datasets',
    "for (const path of ['data/users.json', 'data/pair-members.json'])",
  ],
}

function normalize(source) {
  return source.replace(/\s+/g, ' ').trim()
}

export function inspectSecurityContractCoverage(files) {
  const findings = []

  for (const [path, requiredMarkers] of Object.entries(REQUIRED_SECURITY_CONTRACTS)) {
    const source = files[path]
    if (typeof source !== 'string') {
      findings.push(`required security contract file is missing: ${path}`)
      continue
    }

    const normalizedSource = normalize(source)
    for (const marker of requiredMarkers) {
      if (!normalizedSource.includes(normalize(marker))) {
        findings.push(`security contract lost required coverage in ${path}: ${marker}`)
      }
    }
  }

  return findings
}

export async function auditSecurityContractCoverage(root = process.cwd()) {
  const entries = await Promise.all(
    Object.keys(REQUIRED_SECURITY_CONTRACTS).map(async (path) => {
      try {
        return [path, await readFile(join(root, path), 'utf8')]
      } catch (error) {
        if (error && typeof error === 'object' && error.code === 'ENOENT') return [path, null]
        throw error
      }
    }),
  )

  return inspectSecurityContractCoverage(Object.fromEntries(entries))
}

export async function runSecurityContractCoverageAudit(root = process.cwd()) {
  const findings = await auditSecurityContractCoverage(root)
  if (findings.length > 0) {
    throw new Error(`Security contract coverage audit failed:\n- ${findings.join('\n- ')}`)
  }
  return { ok: true }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  runSecurityContractCoverageAudit()
    .then(() => console.log('Security contract coverage audit passed.'))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
