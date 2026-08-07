import { PairInvitePublicError, runPairInvite, type PairInviteDependencies } from './service.ts'

function assert(condition: unknown, message = 'assertion failed'): asserts condition {
  if (!condition) throw new Error(message)
}

function dependencies(overrides: Partial<PairInviteDependencies> = {}): PairInviteDependencies {
  return {
    appBaseUrl: 'https://receitas.example.test',
    inviteTtlSeconds: 86400,
    getActivePair: async () => 'pair-1',
    revokePending: async () => [],
    deleteUser: async () => undefined,
    createNonceHash: async () => 'a'.repeat(64),
    inviteUser: async () => 'user-2',
    reserveInvite: async () => undefined,
    ...overrides,
  }
}

Deno.test('pair invite cleans newly created Auth user when seat reservation loses a race', async () => {
  let deleted = ''
  try {
    await runPairInvite({ email: 'two@example.test' }, 'user-1', dependencies({
      reserveInvite: async () => { throw new Error('seat occupied') },
      deleteUser: async (userId) => { deleted = userId },
    }))
    throw new Error('expected rejection')
  } catch (error) {
    assert(error instanceof PairInvitePublicError)
    assert(error.code === 'seat_unavailable')
    assert(deleted === 'user-2')
  }
})

Deno.test('pair invite removes previous pending Auth identity before replacement', async () => {
  const events: string[] = []
  await runPairInvite({ email: 'two@example.test' }, 'user-1', dependencies({
    revokePending: async () => { events.push('revoke'); return ['old-user'] },
    deleteUser: async (userId) => { events.push(`delete:${userId}`) },
    inviteUser: async (_email, redirectTo) => { events.push(`invite:${redirectTo}`); return 'new-user' },
    reserveInvite: async ({ invitedUserId }) => { events.push(`reserve:${invitedUserId}`) },
  }))

  assert(events[0] === 'revoke')
  assert(events[1] === 'delete:old-user')
  assert(events[2] === 'invite:https://receitas.example.test/auth/finish-invite?kind=pair')
  assert(!events[2].includes('pair_invite='))
  assert(events[3] === 'reserve:new-user')
})

Deno.test('pair invite stores only a nonce hash and returns no credential', async () => {
  let reservedHash = ''
  const result = await runPairInvite({ email: 'TWO@EXAMPLE.TEST ' }, 'user-1', dependencies({
    reserveInvite: async ({ tokenHash }) => { reservedHash = tokenHash },
  }))

  assert(result.expiresInSeconds === 86400)
  assert(reservedHash === 'a'.repeat(64))
  assert(!('token' in result))
})
