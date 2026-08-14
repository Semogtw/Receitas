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
