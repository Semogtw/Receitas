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

function streamedRequest(chunks: Uint8Array[]): Request {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
  return new Request('https://edge.invalid', { method: 'POST', body })
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

Deno.test('readJsonObject enforces measured limits across streamed chunks', async () => {
  const encoder = new TextEncoder()
  await assertRejects(
    () => readJsonObject(streamedRequest([
      encoder.encode('{"value":"'),
      encoder.encode('12345678'),
      encoder.encode('901234567890"}'),
    ]), 24),
    'request_body_too_large',
  )
})

Deno.test('readJsonObject rejects malformed UTF-8 before JSON parsing', async () => {
  await assertRejects(
    () => readJsonObject(streamedRequest([
      new Uint8Array([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22]),
      new Uint8Array([0xc3, 0x28]),
      new Uint8Array([0x22, 0x7d]),
    ]), 64),
    'invalid_json_object',
  )
})
