import { safeErrorClass } from './http.ts'

function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) throw new Error(`expected ${String(expected)}, got ${String(actual)}`)
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
