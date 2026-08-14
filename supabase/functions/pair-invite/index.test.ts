import { DEFAULT_JSON_BODY_LIMIT_BYTES } from '../_shared/http.ts'
import { createPairInviteHandler } from './index.ts'

function assertEquals(actual: unknown, expected: unknown, message = 'Values differ'): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

const actorUserId = '10000000-0000-4000-8000-000000000001'

Deno.test('pair invite entrypoint is import-safe and rejects non-POST before authentication', async () => {
  let userCalls = 0
  let clientCalls = 0
  const handler = createPairInviteHandler({
    getUserId: async () => {
      userCalls += 1
      return actorUserId
    },
    getClient: () => {
      clientCalls += 1
      throw new Error('client_must_not_be_created')
    },
  })

  const response = await handler(new Request('https://example.supabase.co/functions/v1/pair-invite'))

  assertEquals(response.status, 405)
  assertEquals(userCalls, 0)
  assertEquals(clientCalls, 0)
})

Deno.test('pair invite rejects oversized JSON before authentication or service-role client creation', async () => {
  let userCalls = 0
  let clientCalls = 0
  const handler = createPairInviteHandler({
    getUserId: async () => {
      userCalls += 1
      return actorUserId
    },
    getClient: () => {
      clientCalls += 1
      throw new Error('client_must_not_be_created')
    },
  })
  const body = JSON.stringify({ padding: 'x'.repeat(DEFAULT_JSON_BODY_LIMIT_BYTES + 1) })
  const response = await handler(new Request('https://example.supabase.co/functions/v1/pair-invite', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  }))
  const payload = await response.json()

  assertEquals(response.status, 413)
  assertEquals(payload, {
    error: 'Corpo da requisição muito grande.',
    code: 'request_body_too_large',
  })
  assertEquals(userCalls, 0)
  assertEquals(clientCalls, 0)
})

Deno.test('pair invite rejects malformed JSON before authentication or service-role client creation', async () => {
  let userCalls = 0
  let clientCalls = 0
  const handler = createPairInviteHandler({
    getUserId: async () => {
      userCalls += 1
      return actorUserId
    },
    getClient: () => {
      clientCalls += 1
      throw new Error('client_must_not_be_created')
    },
  })
  const response = await handler(new Request('https://example.supabase.co/functions/v1/pair-invite', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{not-json',
  }))
  const payload = await response.json()

  assertEquals(response.status, 400)
  assertEquals(payload, {
    error: 'Corpo JSON inválido.',
    code: 'invalid_json',
  })
  assertEquals(userCalls, 0)
  assertEquals(clientCalls, 0)
})

Deno.test('pair invite deletes only the identity returned by the just-revoked invite RPC', async () => {
  const pairId = '20000000-0000-4000-8000-000000000001'
  const revokedUserId = '30000000-0000-4000-8000-000000000001'
  const newUserId = '30000000-0000-4000-8000-000000000002'
  const deletedUsers: string[] = []
  const rpcCalls: string[] = []

  const membershipBuilder = {
    select() { return this },
    eq() { return this },
    is() { return this },
    async single() {
      return { data: { pair_id: pairId, activated_at: '2026-08-14T00:00:00.000Z', removed_at: null }, error: null }
    },
  }

  const admin = {
    from(table: string) {
      if (table !== 'pair_members') {
        throw new Error(`historical invite cleanup scan is forbidden: ${table}`)
      }
      return membershipBuilder
    },
    async rpc(name: string) {
      rpcCalls.push(name)
      if (name === 'revoke_pending_pair_invite') return { data: revokedUserId, error: null }
      if (name === 'reserve_pair_invite') return { data: null, error: null }
      throw new Error(`Unexpected RPC ${name}`)
    },
    auth: {
      admin: {
        async deleteUser(userId: string) {
          deletedUsers.push(userId)
          return { data: {}, error: null }
        },
        async inviteUserByEmail() {
          return { data: { user: { id: newUserId } }, error: null }
        },
      },
    },
  }

  const handler = createPairInviteHandler({
    getUserId: async () => actorUserId,
    getClient: () => admin as never,
    appBaseUrl: () => 'https://receitas.example',
    createNonceHash: async () => 'a'.repeat(64),
  })

  const response = await handler(new Request('https://example.supabase.co/functions/v1/pair-invite', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'new@example.com' }),
  }))
  const payload = await response.json()

  assertEquals(response.status, 201)
  assertEquals(payload, { ok: true, expiresInSeconds: 86400 })
  assertEquals(deletedUsers, [revokedUserId])
  assertEquals(rpcCalls, ['revoke_pending_pair_invite', 'reserve_pair_invite'])
})
