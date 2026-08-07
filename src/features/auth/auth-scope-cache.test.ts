import { beforeEach, describe, expect, it } from 'vitest'
import { clearCachedAuthScope, readCachedAuthScope, writeCachedAuthScope } from './auth-scope-cache'

describe('auth scope cache', () => {
  beforeEach(() => window.localStorage.clear())

  it('stores pair scope under the exact user identity', () => {
    writeCachedAuthScope('user-a', 'pair-a')
    expect(readCachedAuthScope('user-a')).toEqual({ version: 1, userId: 'user-a', pairId: 'pair-a' })
    expect(readCachedAuthScope('user-b')).toBeNull()
  })

  it('clears only the requested user scope', () => {
    writeCachedAuthScope('user-a', 'pair-a')
    writeCachedAuthScope('user-b', 'pair-b')
    clearCachedAuthScope('user-a')
    expect(readCachedAuthScope('user-a')).toBeNull()
    expect(readCachedAuthScope('user-b')?.pairId).toBe('pair-b')
  })

  it('rejects malformed cached data rather than treating it as authority', () => {
    window.localStorage.setItem('receitas:auth-scope:v1:user-a', '{bad-json')
    expect(readCachedAuthScope('user-a')).toBeNull()
  })
})
