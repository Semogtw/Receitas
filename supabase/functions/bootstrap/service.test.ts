import { BootstrapPublicError, runBootstrap, type BootstrapDependencies } from './service.ts'

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
