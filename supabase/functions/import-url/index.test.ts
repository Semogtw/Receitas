import { createImportUrlHandler } from './index.ts'

function assertEquals(actual: unknown, expected: unknown, message = 'Values differ'): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function failIfClientCreated() {
  throw new Error('service_role_client_must_not_be_created')
}

Deno.test('import URL rejects non-POST requests before privileged client creation', async () => {
  const handler = createImportUrlHandler({ createClient: failIfClientCreated as never })
  const response = await handler(new Request('https://example.supabase.co/functions/v1/import-url'))
  const body = await response.json()

  assertEquals(response.status, 405)
  assertEquals(body, { error: 'method_not_allowed' })
})

Deno.test('import URL rejects oversized request bodies before privileged client creation', async () => {
  const handler = createImportUrlHandler({ createClient: failIfClientCreated as never })
  const response = await handler(new Request('https://example.supabase.co/functions/v1/import-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/recipe', padding: 'x'.repeat(9 * 1024) }),
  }))
  const body = await response.json()

  assertEquals(response.status, 413)
  assertEquals(body, { error: 'request_body_too_large' })
})

Deno.test('import URL rejects invalid URL input before authentication/backend work', async () => {
  let authCalls = 0
  const handler = createImportUrlHandler({
    createClient: failIfClientCreated as never,
    requestUserId: async () => {
      authCalls += 1
      return '10000000-0000-4000-8000-000000000001'
    },
  })
  const response = await handler(new Request('https://example.supabase.co/functions/v1/import-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: '' }),
  }))
  const body = await response.json()

  assertEquals(response.status, 400)
  assertEquals(body, { error: 'invalid_url' })
  assertEquals(authCalls, 0)
})
