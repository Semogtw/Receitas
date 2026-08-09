import {
  assertRecentPasswordAuthentication,
  MAX_RECENT_AUTH_AGE_SECONDS,
} from './recent-auth.ts'

function assertThrows(action: () => unknown, contains: string): void {
  try {
    action()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes(contains)) throw new Error(`Expected ${contains}, got ${message}`)
    return
  }
  throw new Error(`Expected throw containing ${contains}`)
}

function token(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => btoa(JSON.stringify(value))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.signature`
}

const userId = '10000000-0000-4000-8000-000000000001'
const now = 1_786_250_000

Deno.test('recent password AMR authorizes the destructive account-admin boundary', () => {
  assertRecentPasswordAuthentication(token({
    sub: userId,
    amr: [{ method: 'password', timestamp: now - 30 }],
  }), userId, now)
})

Deno.test('refreshing a session cannot help if password AMR itself is stale', () => {
  assertThrows(() => assertRecentPasswordAuthentication(token({
    sub: userId,
    iat: now,
    amr: [{ method: 'password', timestamp: now - MAX_RECENT_AUTH_AGE_SECONDS - 1 }],
  }), userId, now), 'recent_password_auth_required')
})

Deno.test('OTP/link-only authentication is not treated as current password proof', () => {
  assertThrows(() => assertRecentPasswordAuthentication(token({
    sub: userId,
    amr: [{ method: 'otp', timestamp: now - 5 }],
  }), userId, now), 'recent_password_auth_required')
})

Deno.test('recent proof is bound to the JWT subject', () => {
  assertThrows(() => assertRecentPasswordAuthentication(token({
    sub: '10000000-0000-4000-8000-000000000099',
    amr: [{ method: 'password', timestamp: now - 5 }],
  }), userId, now), 'recent_auth_subject_mismatch')
})

Deno.test('implausibly future AMR timestamps fail closed', () => {
  assertThrows(() => assertRecentPasswordAuthentication(token({
    sub: userId,
    amr: [{ method: 'password', timestamp: now + 61 }],
  }), userId, now), 'recent_password_auth_invalid')
})
