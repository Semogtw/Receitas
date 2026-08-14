import { createBackupRestoreHandler } from './index.ts'

function assertEquals(actual: unknown, expected: unknown, message = 'Values differ'): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

Deno.test('restore entrypoint is import-safe and rejects non-POST without server environment', async () => {
  const response = await createBackupRestoreHandler()(new Request('https://example.supabase.co/functions/v1/backup-restore'))
  const body = await response.json()

  assertEquals(response.status, 405)
  assertEquals(body, { error: 'method_not_allowed' })
})

Deno.test('restore rejects oversized JSON before service-role client creation', async () => {
  const response = await createBackupRestoreHandler()(new Request('https://example.supabase.co/functions/v1/backup-restore', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ padding: 'x'.repeat(3 * 1024 * 1024 + 1) }),
  }))
  const body = await response.json()

  assertEquals(response.status, 413)
  assertEquals(body, { error: 'request_body_too_large' })
})

Deno.test('restore rejects malformed JSON before server environment access', async () => {
  const response = await createBackupRestoreHandler()(new Request('https://example.supabase.co/functions/v1/backup-restore', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{broken-json',
  }))
  const body = await response.json()

  assertEquals(response.status, 400)
  assertEquals(body, { error: 'invalid_request' })
})
