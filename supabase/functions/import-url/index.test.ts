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

Deno.test('import URL requires a current activated membership before rate limit or outbound fetch', async () => {
  const userId = '10000000-0000-4000-8000-000000000001'
  let removedFilter = false
  let activatedFilter = false
  let rateLimitCalls = 0
  let fetchCalls = 0

  const membershipBuilder = {
    select() { return this },
    eq() { return this },
    is(column: string, value: unknown) {
      if (column === 'removed_at' && value === null) removedFilter = true
      return this
    },
    not(column: string, operator: string, value: unknown) {
      if (column === 'activated_at' && operator === 'is' && value === null) activatedFilter = true
      return this
    },
    async maybeSingle() {
      // Simulate an identity that has only an inactive historical membership.
      // The row would be visible to service_role if the active filters regress.
      return removedFilter && activatedFilter
        ? { data: null, error: null }
        : { data: { pair_id: '20000000-0000-4000-8000-000000000001' }, error: null }
    },
  }

  const admin = {
    from(table: string) {
      if (table !== 'pair_members') throw new Error(`Unexpected table ${table}`)
      return membershipBuilder
    },
    async rpc(name: string) {
      if (name !== 'consume_import_url_rate_limit') throw new Error(`Unexpected RPC ${name}`)
      rateLimitCalls += 1
      return { data: true, error: null }
    },
  }

  const handler = createImportUrlHandler({
    createClient: () => admin as never,
    requestUserId: async () => userId,
    fetchImportPayload: async () => {
      fetchCalls += 1
      return {
        body: '<html></html>',
        contentType: 'text/html',
        finalUrl: 'https://example.com/recipe',
      }
    },
  })

  const response = await handler(new Request('https://example.supabase.co/functions/v1/import-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/recipe' }),
  }))
  const body = await response.json()

  assertEquals(response.status, 403)
  assertEquals(body, { error: 'pair_membership_required' })
  assertEquals(removedFilter, true)
  assertEquals(activatedFilter, true)
  assertEquals(rateLimitCalls, 0)
  assertEquals(fetchCalls, 0)
})
