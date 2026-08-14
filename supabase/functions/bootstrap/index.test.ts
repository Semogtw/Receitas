import { DEFAULT_JSON_BODY_LIMIT_BYTES } from '../_shared/http.ts'
import { createBootstrapHandler } from './index.ts'

function assertEquals(actual: unknown, expected: unknown, message = 'Values differ'): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

Deno.test('bootstrap entrypoint is import-safe and rejects non-POST without server environment', async () => {
  const response = await createBootstrapHandler()(new Request('https://example.supabase.co/functions/v1/bootstrap'))
  const body = await response.json()

  assertEquals(response.status, 405)
  assertEquals(body, { error: 'Método não permitido.' })
})

Deno.test('bootstrap rejects oversized public JSON before service-role client creation', async () => {
  const response = await createBootstrapHandler()(new Request('https://example.supabase.co/functions/v1/bootstrap', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ padding: 'x'.repeat(DEFAULT_JSON_BODY_LIMIT_BYTES + 1) }),
  }))
  const body = await response.json()

  assertEquals(response.status, 413)
  assertEquals(body, {
    error: 'Corpo da requisição muito grande.',
    code: 'request_body_too_large',
  })
})

Deno.test('bootstrap rejects malformed public JSON before server environment access', async () => {
  const response = await createBootstrapHandler()(new Request('https://example.supabase.co/functions/v1/bootstrap', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{broken-json',
  }))
  const body = await response.json()

  assertEquals(response.status, 400)
  assertEquals(body, {
    error: 'Corpo JSON inválido.',
    code: 'invalid_json',
  })
})
