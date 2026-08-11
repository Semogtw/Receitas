import { normalizeApplicationOrigin, parseAllowedApplicationOrigins } from './origin.ts'

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function assertThrows(action: () => unknown, expected: string): void {
  try {
    action()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes(expected)) throw new Error(`expected ${expected}, got ${message}`)
    return
  }
  throw new Error(`expected throw containing ${expected}`)
}

Deno.test('normalizeApplicationOrigin accepts exact HTTPS deployment origins', () => {
  assertEquals(normalizeApplicationOrigin(' https://recipes.example.test '), 'https://recipes.example.test')
  assertEquals(normalizeApplicationOrigin('https://recipes.example.test:8443'), 'https://recipes.example.test:8443')
})

Deno.test('normalizeApplicationOrigin permits HTTP only for loopback development', () => {
  assertEquals(normalizeApplicationOrigin('http://localhost:5173'), 'http://localhost:5173')
  assertEquals(normalizeApplicationOrigin('http://127.0.0.1:4173'), 'http://127.0.0.1:4173')
  assertEquals(normalizeApplicationOrigin('http://[::1]:54321'), 'http://[::1]:54321')
  assertThrows(() => normalizeApplicationOrigin('http://recipes.example.test'), 'https_required')
})

Deno.test('normalizeApplicationOrigin rejects credentials, paths, query and fragments', () => {
  for (const value of [
    'https://user:pass@recipes.example.test',
    'https://recipes.example.test/app',
    'https://recipes.example.test/?preview=1',
    'https://recipes.example.test/#fragment',
  ]) {
    assertThrows(() => normalizeApplicationOrigin(value), value.includes('@') ? 'credentials_not_allowed' : 'must_be_origin_only')
  }
})

Deno.test('parseAllowedApplicationOrigins validates every configured origin and deduplicates canonical values', () => {
  assertEquals(
    [...parseAllowedApplicationOrigins('https://recipes.example.test, http://localhost:5173, https://recipes.example.test')],
    ['https://recipes.example.test', 'http://localhost:5173'],
  )
  assertThrows(
    () => parseAllowedApplicationOrigins('https://recipes.example.test, http://attacker.example.test'),
    'https_required',
  )
  assertThrows(() => parseAllowedApplicationOrigins(' , '), 'allowed_origin_required')
})
