import { getRequestUserId } from './server.ts'

function assertEquals(actual: unknown, expected: unknown, message = 'Values differ'): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

Deno.test('missing Authorization is rejected before server environment is required', async () => {
  let message = ''
  try {
    await getRequestUserId(new Request('https://example.supabase.co/functions/v1/protected'))
  } catch (error) {
    message = error instanceof Error ? error.message : String(error)
  }

  assertEquals(message, 'authentication_required')
})

Deno.test('empty and malformed Bearer headers are rejected consistently', async () => {
  for (const authorization of ['Bearer', 'Bearer   ', 'Basic abc', '']) {
    const headers = authorization ? { authorization } : undefined
    let message = ''
    try {
      await getRequestUserId(new Request('https://example.supabase.co/functions/v1/protected', { headers }))
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    assertEquals(message, 'authentication_required', `Unexpected result for ${authorization || 'missing header'}`)
  }
})
