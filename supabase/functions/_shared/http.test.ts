import { readJsonObject, safeErrorClass } from './http.ts'

function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) throw new Error(`expected ${String(expected)}, got ${String(actual)}`)
}

async function assertRejects(action: () => Promise<unknown>, expected: string): Promise<void> {
  try {
    await action()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes(expected)) throw new Error(`expected ${expected}, got ${message}`)
    return
  }
  throw new Error(`expected rejection containing ${expected}`)
}

Deno.test('safeErrorClass exposes only a bounded structural error class', () => {
  const error = new Error('https://private.example.test/path?token=secret user payload fragment')
  error.name = 'TypeError'

  assertEquals(safeErrorClass(error), 'TypeError')
})

Deno.test('safeErrorClass does not copy arbitrary or malformed error names', () => {
  const error = new Error('sensitive message')
  error.name = 'User email alice@example.test secret=abc123'

  assertEquals(safeErrorClass(error), 'Error')
  assertEquals(safeErrorClass({ message: 'secret' }), 'UnknownError')
})

Deno.test('readJsonObject accepts a bounded object and rejects arrays or malformed JSON', async () => {
  const value = await readJsonObject(new Request('https://edge.invalid', {
    method: 'POST',
    body: JSON.stringify({ action: 'status' }),
  }), 128)
  assertEquals(value.action, 'status')

  await assertRejects(
    () => readJsonObject(new Request('https://edge.invalid', { method: 'POST', body: '[]' }), 128),
    'invalid_json_object',
  )
  await assertRejects(
    () => readJsonObject(new Request('https://edge.invalid', { method: 'POST', body: '{' }), 128),
    'invalid_json_object',
  )
})

Deno.test('readJsonObject rejects oversized bodies by declared or measured byte size', async () => {
  await assertRejects(
    () => readJsonObject(new Request('https://edge.invalid', {
      method: 'POST',
      headers: { 'content-length': '4096' },
      body: '{}',
    }), 64),
    'request_body_too_large',
  )

  await assertRejects(
    () => readJsonObject(new Request('https://edge.invalid', {
      method: 'POST',
      body: JSON.stringify({ value: 'á'.repeat(40) }),
    }), 64),
    'request_body_too_large',
  )
})
