import { createPermanentDeleteHandler } from './index.ts'

function assertEquals(actual: unknown, expected: unknown, message = 'Values differ'): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

Deno.test('permanent delete rejects non-POST before privileged client creation', async () => {
  let clientCalls = 0
  const handler = createPermanentDeleteHandler({
    getClient: () => {
      clientCalls += 1
      throw new Error('client_must_not_be_created')
    },
  })

  const response = await handler(new Request('https://example.supabase.co/functions/v1/permanent-delete'))
  const body = await response.json()

  assertEquals(response.status, 405)
  assertEquals(body, { error: 'method_not_allowed' })
  assertEquals(clientCalls, 0)
})

Deno.test('permanent delete rejects oversized JSON before privileged client/auth work', async () => {
  let clientCalls = 0
  let authCalls = 0
  const handler = createPermanentDeleteHandler({
    getClient: () => {
      clientCalls += 1
      throw new Error('client_must_not_be_created')
    },
    getUserId: async () => {
      authCalls += 1
      return '10000000-0000-4000-8000-000000000001'
    },
  })

  const response = await handler(new Request('https://example.supabase.co/functions/v1/permanent-delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ padding: 'x'.repeat(33 * 1024) }),
  }))
  const body = await response.json()

  assertEquals(response.status, 413)
  assertEquals(body, { error: 'request_body_too_large' })
  assertEquals(clientCalls, 0)
  assertEquals(authCalls, 0)
})

Deno.test('permanent delete rejects malformed JSON before privileged client/auth work', async () => {
  let clientCalls = 0
  let authCalls = 0
  const handler = createPermanentDeleteHandler({
    getClient: () => {
      clientCalls += 1
      throw new Error('client_must_not_be_created')
    },
    getUserId: async () => {
      authCalls += 1
      return '10000000-0000-4000-8000-000000000001'
    },
  })

  const response = await handler(new Request('https://example.supabase.co/functions/v1/permanent-delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{broken-json',
  }))
  const body = await response.json()

  assertEquals(response.status, 400)
  assertEquals(body, { error: 'invalid_json_object' })
  assertEquals(clientCalls, 0)
  assertEquals(authCalls, 0)
})
