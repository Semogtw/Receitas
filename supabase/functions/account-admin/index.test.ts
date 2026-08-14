import { createAccountAdminHandler } from './index.ts'
import { MAX_RECENT_AUTH_AGE_SECONDS } from './recent-auth.ts'

function assert(condition: unknown, message = 'Assertion failed'): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEquals(actual: unknown, expected: unknown, message = 'Values differ'): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

const actorUserId = '10000000-0000-4000-8000-000000000001'
const otherUserId = '10000000-0000-4000-8000-000000000002'
const recoverableUserId = '10000000-0000-4000-8000-000000000003'
const attackerChosenTarget = '10000000-0000-4000-8000-000000000099'
const replacementUserId = '10000000-0000-4000-8000-000000000077'
const pairId = '20000000-0000-4000-8000-000000000002'
const safetyJobId = '30000000-0000-4000-8000-000000000003'
const actionId = '40000000-0000-4000-8000-000000000004'

function encodeJwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => btoa(JSON.stringify(value))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.signature`
}

function recentToken(nowSeconds = Math.floor(Date.now() / 1000)): string {
  return encodeJwt({
    sub: actorUserId,
    amr: [{ method: 'password', timestamp: nowSeconds - 5 }],
  })
}

function request(body: Record<string, unknown>, token = recentToken()): Request {
  return new Request('https://example.supabase.co/functions/v1/account-admin', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

function fakeAdmin(options: {
  otherUserId?: string | null
  recoverableUserId?: string | null
  pendingReplacement?: boolean
  replacementCleanupPending?: boolean
  deleteUserError?: boolean
  lookupUserError?: boolean
} = {}) {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []
  const deleteUserCalls: string[] = []
  let fromCalls = 0
  let pendingReplacement = options.pendingReplacement ?? false
  let replacementCleanupPending = options.replacementCleanupPending ?? false

  const membershipBuilder = {
    select() { return this },
    eq() { return this },
    is() { return this },
    not() { return this },
    async maybeSingle() {
      return { data: { pair_id: pairId }, error: null }
    },
  }

  const admin = {
    from(table: string) {
      fromCalls += 1
      if (table !== 'pair_members') throw new Error(`Unexpected table ${table}`)
      return membershipBuilder
    },
    auth: {
      admin: {
        async getUserById(userId: string) {
          if (options.lookupUserError) {
            return { data: { user: null }, error: { message: 'lookup failed' } }
          }
          return { data: { user: { id: userId, email: `${userId.slice(-4)}@example.com` } }, error: null }
        },
        async deleteUser(userId: string) {
          deleteUserCalls.push(userId)
          if (options.deleteUserError) {
            return { data: {}, error: { message: 'delete failed' } }
          }
          return { data: {}, error: null }
        },
        async inviteUserByEmail(email: string) {
          return {
            data: { user: { id: replacementUserId, email } },
            error: null,
          }
        },
      },
    },
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args })
      if (name === 'read_account_admin_status_server') {
        return {
          data: {
            other_user_id: options.otherUserId === undefined ? otherUserId : options.otherUserId,
            recoverable_target_user_id: options.recoverableUserId ?? null,
            pending_replacement: pendingReplacement ? {
              id: actionId,
              target_user_id: otherUserId,
              replacement_user_id: replacementUserId,
              status: 'pending_activation',
              expires_at: '2099-01-01T00:00:00.000Z',
              auth_cleanup_pending: false,
              replacement_auth_cleanup_pending: false,
            } : null,
            auth_cleanup_actions: replacementCleanupPending ? [{
              id: actionId,
              target_user_id: otherUserId,
              replacement_user_id: replacementUserId,
              status: 'cancelled',
              auth_cleanup_pending: false,
              replacement_auth_cleanup_pending: true,
            }] : [],
          },
          error: null,
        }
      }
      if (name === 'account_admin_remove_other') return { data: actionId, error: null }
      if (name === 'account_admin_begin_replacement') return { data: actionId, error: null }
      if (name === 'account_admin_mark_auth_cleanup') return { data: null, error: null }
      if (name === 'account_admin_mark_replacement_auth_cleanup') {
        replacementCleanupPending = args.p_pending === true
        return { data: null, error: null }
      }
      if (name === 'account_admin_complete_replacement') return { data: pairId, error: null }
      if (name === 'account_admin_cancel_replacement_v2') {
        pendingReplacement = false
        replacementCleanupPending = true
        return { data: replacementUserId, error: null }
      }
      throw new Error(`Unexpected RPC ${name}`)
    },
  }

  return {
    admin: admin as never,
    rpcCalls,
    deleteUserCalls,
    get fromCalls() { return fromCalls },
  }
}

function handler(fake: ReturnType<typeof fakeAdmin>) {
  return createAccountAdminHandler({
    createClient: () => fake.admin,
    requestUserId: async () => actorUserId,
    appBaseUrl: () => 'https://receitas.example',
  })
}

Deno.test('status exposes only replacement availability, not the removed recoverable target UUID', async () => {
  const fake = fakeAdmin({ otherUserId: null, recoverableUserId })
  const response = await handler(fake)(request({ action: 'status' }))
  const body = await response.json()

  assertEquals(response.status, 200)
  assertEquals(body, {
    status: {
      otherMember: null,
      replacementAvailable: true,
      pendingReplacement: null,
      authCleanupPending: false,
    },
  })
  assert(!JSON.stringify(body).includes(recoverableUserId), 'Recoverable historical UUID leaked to browser')
})

Deno.test('stale password AMR blocks destructive mutation before status or mutation RPCs', async () => {
  const fake = fakeAdmin()
  const now = Math.floor(Date.now() / 1000)
  const stale = encodeJwt({
    sub: actorUserId,
    amr: [{ method: 'password', timestamp: now - MAX_RECENT_AUTH_AGE_SECONDS - 1 }],
  })

  const response = await handler(fake)(request({
    action: 'remove_other',
    safetyJobId,
  }, stale))
  const body = await response.json()

  assertEquals(response.status, 409)
  assertEquals(body, { error: 'recent_password_auth_required' })
  assertEquals(fake.rpcCalls, [])
})

Deno.test('remove_other ignores a browser-supplied target and uses only the server-derived active other member', async () => {
  const fake = fakeAdmin({ otherUserId })
  const response = await handler(fake)(request({
    action: 'remove_other',
    safetyJobId,
    targetUserId: attackerChosenTarget,
  }))

  assertEquals(response.status, 200)
  const destructive = fake.rpcCalls.find((call) => call.name === 'account_admin_remove_other')
  assert(destructive, 'Expected account_admin_remove_other RPC')
  assertEquals(destructive.args.p_target_user_id, otherUserId)
  assert(destructive.args.p_target_user_id !== attackerChosenTarget, 'Browser-controlled target reached destructive RPC')
})

Deno.test('delayed replacement uses only the server-derived recoverable target after access-only removal', async () => {
  const fake = fakeAdmin({ otherUserId: null, recoverableUserId })
  const response = await handler(fake)(request({
    action: 'begin_replacement',
    safetyJobId,
    replacementEmail: 'new@example.com',
    targetUserId: attackerChosenTarget,
  }))
  const body = await response.json()

  assertEquals(response.status, 200)
  assertEquals(body, {
    pending: true,
    replacementEmail: 'new@example.com',
    authCleanupPending: false,
  })
  const destructive = fake.rpcCalls.find((call) => call.name === 'account_admin_begin_replacement')
  assert(destructive, 'Expected account_admin_begin_replacement RPC')
  assertEquals(destructive.args.p_target_user_id, recoverableUserId)
  assertEquals(destructive.args.p_replacement_user_id, replacementUserId)
  assert(destructive.args.p_target_user_id !== attackerChosenTarget, 'Browser-controlled target reached replacement RPC')
})

Deno.test('replacement completion does not require an already-active pair membership', async () => {
  const fake = fakeAdmin({ otherUserId: null })
  const response = await handler(fake)(request({ action: 'complete_replacement' }))
  const body = await response.json()

  assertEquals(response.status, 200)
  assertEquals(body, { pairId })
  assertEquals(fake.fromCalls, 0, 'Pending replacement should not need active membership before completion')
  assert(fake.rpcCalls.some((call) => call.name === 'account_admin_complete_replacement'))
})

Deno.test('cancel replacement keeps a retryable cleanup flag when provider deletion fails', async () => {
  const fake = fakeAdmin({ pendingReplacement: true, deleteUserError: true })
  const response = await handler(fake)(request({ action: 'cancel_replacement' }))
  const body = await response.json()

  assertEquals(response.status, 200)
  assertEquals(body, { cancelled: true, authCleanupPending: true })
  assertEquals(fake.deleteUserCalls, [replacementUserId])
  assert(fake.rpcCalls.some((call) => call.name === 'account_admin_cancel_replacement_v2'))
  assert(!fake.rpcCalls.some((call) => call.name === 'account_admin_mark_replacement_auth_cleanup'))
})

Deno.test('successful cancellation clears replacement cleanup only after database cancellation', async () => {
  const fake = fakeAdmin({ pendingReplacement: true })
  const response = await handler(fake)(request({ action: 'cancel_replacement' }))
  const body = await response.json()

  assertEquals(response.status, 200)
  assertEquals(body, { cancelled: true, authCleanupPending: false })
  const cancelIndex = fake.rpcCalls.findIndex((call) => call.name === 'account_admin_cancel_replacement_v2')
  const cleanIndex = fake.rpcCalls.findIndex((call) => call.name === 'account_admin_mark_replacement_auth_cleanup')
  assert(cancelIndex >= 0, 'Expected database cancellation RPC')
  assert(cleanIndex > cancelIndex, 'Replacement cleanup was acknowledged before database cancellation')
})

Deno.test('retry auth cleanup drains a cancelled replacement identity', async () => {
  const fake = fakeAdmin({ replacementCleanupPending: true })
  const response = await handler(fake)(request({ action: 'retry_auth_cleanup' }))
  const body = await response.json()

  assertEquals(response.status, 200)
  assertEquals(body, { authCleanupPending: false })
  assertEquals(fake.deleteUserCalls, [replacementUserId])
  assert(fake.rpcCalls.some((call) => call.name === 'account_admin_mark_replacement_auth_cleanup'))
})
