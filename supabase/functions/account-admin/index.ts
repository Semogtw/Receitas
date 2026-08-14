import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.110.9'
import { readJsonObject as readBoundedJsonObject, withCorsAndErrors } from '../_shared/http.ts'
import { createServerClient, getAppBaseUrl, getRequestUserId } from '../_shared/server.ts'
import { assertRecentPasswordAuthentication, bearerToken } from './recent-auth.ts'

const ACCOUNT_ADMIN_BODY_LIMIT_BYTES = 16 * 1024

interface AccountAdminStatusRow {
  other_user_id: string | null
  recoverable_target_user_id: string | null
  pending_replacement: null | {
    id: string
    target_user_id: string
    replacement_user_id: string
    status: string
    expires_at: string
    auth_cleanup_pending: boolean
    replacement_auth_cleanup_pending: boolean
  }
  auth_cleanup_actions: Array<{
    id: string
    target_user_id: string
    replacement_user_id: string | null
    status: string
    auth_cleanup_pending: boolean
    replacement_auth_cleanup_pending: boolean
  }>
}

export interface AccountAdminDependencies {
  createClient?: () => unknown
  requestUserId?: (client: SupabaseClient, request: Request) => Promise<string>
  appBaseUrl?: () => string
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function text(value: unknown, label: string, maxLength = 320): string {
  if (typeof value !== 'string') throw new Error(`${label}_invalid`)
  const normalized = value.trim()
  if (!normalized || normalized.length > maxLength) throw new Error(`${label}_invalid`)
  return normalized
}

function uuid(value: unknown, label: string): string {
  const candidate = text(value, label, 64).toLowerCase()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(candidate)) {
    throw new Error(`${label}_invalid`)
  }
  return candidate
}

function normalizeEmail(value: unknown): string {
  const email = text(value, 'replacement_email').toLocaleLowerCase('en-US')
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('replacement_email_invalid')
  }
  return email
}

async function activePairForUser(admin: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await admin
    .from('pair_members')
    .select('pair_id')
    .eq('user_id', userId)
    .is('removed_at', null)
    .not('activated_at', 'is', null)
    .maybeSingle()
  if (error) throw new Error('account_admin_membership_unavailable')
  if (!data?.pair_id) throw new Error('account_admin_membership_required')
  return uuid(data.pair_id, 'account_admin_pair_id')
}

function statusRow(value: unknown): AccountAdminStatusRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('account_admin_status_invalid')
  const row = value as Record<string, unknown>
  if (!Array.isArray(row.auth_cleanup_actions)) throw new Error('account_admin_cleanup_status_invalid')
  return row as unknown as AccountAdminStatusRow
}

async function readStatus(admin: SupabaseClient, pairId: string, actorUserId: string): Promise<AccountAdminStatusRow> {
  const { data, error } = await admin.rpc('read_account_admin_status_server', {
    p_pair_id: pairId,
    p_actor_user_id: actorUserId,
  })
  if (error) throw new Error('account_admin_status_unavailable')
  return statusRow(data)
}

async function emailForUser(admin: SupabaseClient, userId: string | null): Promise<string | null> {
  if (!userId) return null
  const { data, error } = await admin.auth.admin.getUserById(userId)
  if (error || !data.user) return null
  return data.user.email?.trim().toLocaleLowerCase('en-US') ?? null
}

async function publicStatus(admin: SupabaseClient, pairId: string, actorUserId: string) {
  const status = await readStatus(admin, pairId, actorUserId)
  const otherUserId = status.other_user_id ? uuid(status.other_user_id, 'account_admin_other_user_id') : null
  const recoverableTargetUserId = status.recoverable_target_user_id
    ? uuid(status.recoverable_target_user_id, 'account_admin_recoverable_target_user_id')
    : null
  const pending = status.pending_replacement
  const replacementUserId = pending?.replacement_user_id
    ? uuid(pending.replacement_user_id, 'account_admin_replacement_user_id')
    : null

  const [otherEmail, replacementEmail] = await Promise.all([
    emailForUser(admin, otherUserId),
    emailForUser(admin, replacementUserId),
  ])

  return {
    otherMember: otherUserId ? { userId: otherUserId, email: otherEmail } : null,
    // A removed identity can remain an administrative recovery target. Expose
    // only the capability bit; the historical target UUID stays server-side.
    replacementAvailable: Boolean(otherUserId || recoverableTargetUserId),
    pendingReplacement: pending ? {
      actionId: uuid(pending.id, 'account_admin_action_id'),
      replacementUserId,
      replacementEmail,
      expiresAt: text(pending.expires_at, 'account_admin_replacement_expiry', 64),
      authCleanupPending: pending.auth_cleanup_pending === true || pending.replacement_auth_cleanup_pending === true,
    } : null,
    authCleanupPending: status.auth_cleanup_actions.length > 0,
  }
}

async function markAuthCleanup(admin: SupabaseClient, actionId: string, pending: boolean): Promise<void> {
  const { error } = await admin.rpc('account_admin_mark_auth_cleanup', {
    p_action_id: actionId,
    p_pending: pending,
  })
  if (error) throw new Error('account_admin_cleanup_mark_failed')
}

async function markReplacementAuthCleanup(admin: SupabaseClient, actionId: string, pending: boolean): Promise<void> {
  const { error } = await admin.rpc('account_admin_mark_replacement_auth_cleanup', {
    p_action_id: actionId,
    p_pending: pending,
  })
  if (error) throw new Error('account_admin_replacement_cleanup_mark_failed')
}

async function acknowledgeCleanup(markClean: () => Promise<void>): Promise<boolean> {
  try {
    await markClean()
    return true
  } catch {
    return false
  }
}

async function deleteAuthIdentity(admin: SupabaseClient, userId: string, actionId: string): Promise<boolean> {
  const { error } = await admin.auth.admin.deleteUser(userId, false)
  if (!error) {
    return acknowledgeCleanup(() => markAuthCleanup(admin, actionId, false))
  }

  // A retry may observe an identity that was already removed by the provider.
  // Provider lookup errors are not proof of deletion and must keep the queue.
  const { data, error: lookupError } = await admin.auth.admin.getUserById(userId)
  if (lookupError) return false
  if (!data.user) {
    return acknowledgeCleanup(() => markAuthCleanup(admin, actionId, false))
  }
  return false
}

async function deleteReplacementAuthIdentity(admin: SupabaseClient, userId: string, actionId: string): Promise<boolean> {
  const { error } = await admin.auth.admin.deleteUser(userId, false)
  if (!error) {
    return acknowledgeCleanup(() => markReplacementAuthCleanup(admin, actionId, false))
  }

  const { data, error: lookupError } = await admin.auth.admin.getUserById(userId)
  if (lookupError) return false
  if (!data.user) {
    return acknowledgeCleanup(() => markReplacementAuthCleanup(admin, actionId, false))
  }
  return false
}

async function requireRecentPassword(request: Request, userId: string): Promise<void> {
  assertRecentPasswordAuthentication(bearerToken(request), userId)
}

function publicError(error: unknown): Response {
  const code = error instanceof Error ? error.message : 'account_admin_failed'
  if (code === 'authentication_required') return json(401, { error: 'authentication_required' })
  if (code === 'request_body_too_large') return json(413, { error: 'request_body_too_large' })
  if (code === 'invalid_json_object') return json(400, { error: 'invalid_request' })
  if (code.includes('membership_required')) return json(403, { error: 'pair_membership_required' })
  if (code.includes('recent_password_auth')) return json(409, { error: 'recent_password_auth_required' })
  if (code.includes('replacement_email_invalid') || code.includes('_invalid')) return json(400, { error: 'invalid_account_admin_request' })
  if (code.includes('safety') || code.includes('canonical state')) return json(409, { error: 'safety_backup_required' })
  if (code.includes('pending') || code.includes('replacement') || code.includes('target')) return json(409, { error: 'account_admin_state_conflict' })
  if (code.includes('unavailable') || code.includes('_failed')) return json(503, { error: 'account_admin_service_unavailable' })
  return json(422, { error: 'account_admin_request_rejected' })
}

export function createAccountAdminHandler(dependencies: AccountAdminDependencies = {}) {
  const createClient = dependencies.createClient ?? createServerClient
  const requestUserId = dependencies.requestUserId ?? getRequestUserId
  const appBaseUrl = dependencies.appBaseUrl ?? getAppBaseUrl

  return withCorsAndErrors(async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' })

    let body: Record<string, unknown>
    try {
      body = await readBoundedJsonObject(request, ACCOUNT_ADMIN_BODY_LIMIT_BYTES)
    } catch (error) {
      return publicError(error)
    }
    const action = typeof body.action === 'string' ? body.action : ''

    const admin = createClient() as SupabaseClient
    const userId = await requestUserId(admin, request)

    try {
      if (action === 'complete_replacement') {
        const { data: pairId, error } = await admin.rpc('account_admin_complete_replacement', {
          p_replacement_user_id: userId,
        })
        if (error || !pairId) throw new Error('replacement_completion_failed')
        return json(200, { pairId })
      }

      const pairId = await activePairForUser(admin, userId)

      if (action === 'status') {
        return json(200, { status: await publicStatus(admin, pairId, userId) })
      }

      // Reject stale authentication before reading administrative status or
      // invoking any destructive mutation RPC.
      await requireRecentPassword(request, userId)
      const status = await readStatus(admin, pairId, userId)

      if (action === 'remove_other') {
        if (!status.other_user_id) throw new Error('account_admin_target_missing')
        const targetUserId = uuid(status.other_user_id, 'account_admin_target_user_id')
        const safetyJobId = uuid(body.safetyJobId, 'account_admin_safety_job_id')
        const { data: actionIdRaw, error } = await admin.rpc('account_admin_remove_other', {
          p_pair_id: pairId,
          p_actor_user_id: userId,
          p_target_user_id: targetUserId,
          p_safety_job_id: safetyJobId,
        })
        if (error || !actionIdRaw) throw new Error('account_admin_remove_failed')
        const actionId = uuid(actionIdRaw, 'account_admin_action_id')
        const authDeleted = await deleteAuthIdentity(admin, targetUserId, actionId)
        return json(200, { removed: true, authCleanupPending: !authDeleted })
      }

      if (action === 'begin_replacement') {
        if (status.pending_replacement) throw new Error('account_admin_replacement_already_pending')
        const targetUserIdRaw = status.other_user_id ?? status.recoverable_target_user_id
        if (!targetUserIdRaw) throw new Error('account_admin_target_missing')
        const targetUserId = uuid(targetUserIdRaw, 'account_admin_target_user_id')
        const safetyJobId = uuid(body.safetyJobId, 'account_admin_safety_job_id')
        const replacementEmail = normalizeEmail(body.replacementEmail)
        const actorEmail = await emailForUser(admin, userId)
        if (actorEmail && replacementEmail === actorEmail) throw new Error('replacement_email_invalid')

        const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(replacementEmail, {
          redirectTo: `${appBaseUrl()}/auth/finish-replacement`,
        })
        if (inviteError || !invited.user) throw new Error('replacement_invite_failed')
        const replacementUserId = invited.user.id

        const { data: actionIdRaw, error } = await admin.rpc('account_admin_begin_replacement', {
          p_pair_id: pairId,
          p_actor_user_id: userId,
          p_target_user_id: targetUserId,
          p_replacement_user_id: replacementUserId,
          p_safety_job_id: safetyJobId,
        })
        if (error || !actionIdRaw) {
          await admin.auth.admin.deleteUser(replacementUserId, false).catch(() => undefined)
          throw new Error('account_admin_replacement_begin_failed')
        }

        const actionId = uuid(actionIdRaw, 'account_admin_action_id')
        const authDeleted = await deleteAuthIdentity(admin, targetUserId, actionId)
        return json(200, {
          pending: true,
          replacementEmail,
          authCleanupPending: !authDeleted,
        })
      }

      if (action === 'cancel_replacement') {
        if (!status.pending_replacement) throw new Error('account_admin_replacement_not_pending')
        const actionId = uuid(status.pending_replacement.id, 'account_admin_action_id')
        const { data: replacementUserIdRaw, error } = await admin.rpc('account_admin_cancel_replacement_v2', {
          p_pair_id: pairId,
          p_actor_user_id: userId,
          p_action_id: actionId,
        })
        if (error || !replacementUserIdRaw) throw new Error('account_admin_replacement_cancel_failed')
        const replacementUserId = uuid(replacementUserIdRaw, 'account_admin_replacement_user_id')
        const authDeleted = await deleteReplacementAuthIdentity(admin, replacementUserId, actionId)
        return json(200, { cancelled: true, authCleanupPending: !authDeleted })
      }

      if (action === 'retry_auth_cleanup') {
        for (const item of status.auth_cleanup_actions) {
          const actionId = uuid(item.id, 'account_admin_action_id')
          if (item.auth_cleanup_pending === true) {
            const targetUserId = uuid(item.target_user_id, 'account_admin_target_user_id')
            await deleteAuthIdentity(admin, targetUserId, actionId)
          }
          if (item.replacement_auth_cleanup_pending === true && item.replacement_user_id) {
            const replacementUserId = uuid(item.replacement_user_id, 'account_admin_replacement_user_id')
            await deleteReplacementAuthIdentity(admin, replacementUserId, actionId)
          }
        }
        const refreshed = await readStatus(admin, pairId, userId)
        return json(200, { authCleanupPending: refreshed.auth_cleanup_actions.length > 0 })
      }

      return json(400, { error: 'unsupported_action' })
    } catch (error) {
      return publicError(error)
    }
  })
}

if (import.meta.main) Deno.serve(createAccountAdminHandler())
