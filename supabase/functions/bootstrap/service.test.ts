import {
  BootstrapPublicError,
  runBootstrap,
  runBootstrapReinvite,
  type BootstrapDependencies,
  type BootstrapReinviteDependencies,
} from './service.ts'

function assert(condition: unknown, message = 'assertion failed'): asserts condition {
  if (!condition) throw new Error(message)
}

function dependencies(overrides: Partial<BootstrapDependencies> = {}): BootstrapDependencies {
  return {
    appBaseUrl: 'https://receitas.example.test',
    verifySecret: async () => true,
    isAvailable: async () => true,
    inviteUser: async () => 'user-1',
    createPair: async () => undefined,
    deleteUser: async () => undefined,
    ...overrides,
  }
}

function reinviteDependencies(overrides: Partial<BootstrapReinviteDependencies> = {}): BootstrapReinviteDependencies {
  return {
    appBaseUrl: 'https://receitas.example.test',
    verifySecret: async () => true,
    begin: async () => ({ attemptId: 'attempt-1', oldUserId: 'old-user' }),
    findAuthUser: async () => 'old-user',
    deleteUser: async () => undefined,
    inviteUser: async () => 'new-user',
    finish: async () => undefined,
    abort: async () => undefined,
    ...overrides,
  }
}

Deno.test('bootstrap rejects an invalid setup secret before creating a user', async () => {
  let invited = false
  try {
    await runBootstrap(
      { email: 'one@example.test', bootstrapSecret: 'wrong' },
      dependencies({
        verifySecret: async () => false,
        inviteUser: async () => {
          invited = true
          return 'user-1'
        },
      }),
    )
    throw new Error('expected rejection')
  } catch (error) {
    assert(error instanceof BootstrapPublicError)
    assert(error.status === 403)
    assert(invited === false)
  }
})

Deno.test('bootstrap compensates Auth user when pair creation loses the race', async () => {
  let deletedUser = ''
  try {
    await runBootstrap(
      { email: 'one@example.test', bootstrapSecret: 'valid' },
      dependencies({
        createPair: async () => {
          throw new Error('bootstrap already consumed')
        },
        deleteUser: async (userId) => {
          deletedUser = userId
        },
      }),
    )
    throw new Error('expected rejection')
  } catch (error) {
    assert(error instanceof BootstrapPublicError)
    assert(error.status === 409)
    assert(deletedUser === 'user-1')
  }
})

Deno.test('bootstrap returns verification requirement after invitation and pair reservation', async () => {
  const result = await runBootstrap(
    { email: 'ONE@EXAMPLE.TEST ', bootstrapSecret: 'valid' },
    dependencies({
      inviteUser: async (email, redirectTo) => {
        assert(email === 'one@example.test')
        assert(redirectTo === 'https://receitas.example.test/auth/finish-invite?kind=bootstrap')
        return 'user-1'
      },
    }),
  )

  assert(result.requiresEmailVerification === true)
})

Deno.test('bootstrap reinvite replaces the old pending identity and preserves the pair', async () => {
  const events: string[] = []
  const result = await runBootstrapReinvite(
    { email: 'ONE@EXAMPLE.TEST ', bootstrapSecret: 'valid' },
    reinviteDependencies({
      findAuthUser: async () => 'old-user',
      deleteUser: async (userId) => {
        events.push(`delete:${userId}`)
      },
      inviteUser: async (email, redirectTo) => {
        events.push(`invite:${email}:${redirectTo}`)
        return 'new-user'
      },
      finish: async (attemptId, newUserId) => {
        events.push(`finish:${attemptId}:${newUserId}`)
      },
    }),
  )

  assert(events[0] === 'delete:old-user')
  assert(events[1] === 'invite:one@example.test:https://receitas.example.test/auth/finish-invite?kind=bootstrap')
  assert(events[2] === 'finish:attempt-1:new-user')
  assert(result.requiresEmailVerification === true)
})

Deno.test('bootstrap reinvite resumes after a previous request already created the new Auth user', async () => {
  let invitedAgain = false
  let finishedWith = ''

  await runBootstrapReinvite(
    { email: 'one@example.test', bootstrapSecret: 'valid' },
    reinviteDependencies({
      findAuthUser: async () => 'new-user-from-previous-request',
      inviteUser: async () => {
        invitedAgain = true
        return 'unexpected'
      },
      finish: async (_attemptId, newUserId) => {
        finishedWith = newUserId
      },
    }),
  )

  assert(invitedAgain === false)
  assert(finishedWith === 'new-user-from-previous-request')
})

Deno.test('bootstrap reinvite restores the old database reservation when Auth deletion definitely fails', async () => {
  let lookupCount = 0
  let aborted = false

  try {
    await runBootstrapReinvite(
      { email: 'one@example.test', bootstrapSecret: 'valid' },
      reinviteDependencies({
        findAuthUser: async () => {
          lookupCount += 1
          return 'old-user'
        },
        deleteUser: async () => {
          throw new Error('auth unavailable')
        },
        abort: async () => {
          aborted = true
        },
      }),
    )
    throw new Error('expected rejection')
  } catch (error) {
    assert(error instanceof BootstrapPublicError)
    assert(error.code === 'cleanup_failed')
    assert(lookupCount === 2)
    assert(aborted === true)
  }
})

Deno.test('bootstrap reinvite can recover when invite response is lost after creating the user', async () => {
  let lookupCount = 0
  let finishedWith = ''

  await runBootstrapReinvite(
    { email: 'one@example.test', bootstrapSecret: 'valid' },
    reinviteDependencies({
      findAuthUser: async () => {
        lookupCount += 1
        if (lookupCount === 1) return null
        return 'new-user-created-despite-error'
      },
      inviteUser: async () => {
        throw new Error('response lost')
      },
      finish: async (_attemptId, newUserId) => {
        finishedWith = newUserId
      },
    }),
  )

  assert(finishedWith === 'new-user-created-despite-error')
})
