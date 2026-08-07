import { describe, expect, it } from 'vitest'
import { databaseNameForScope } from './database'

describe('databaseNameForScope', () => {
  it('creates a deterministic isolated filename from authenticated UUIDs', () => {
    expect(databaseNameForScope({
      userId: '10000000-0000-4000-8000-000000000001',
      pairId: '20000000-0000-4000-8000-000000000002',
    })).toBe('receitas-10000000-0000-4000-8000-000000000001-20000000-0000-4000-8000-000000000002.db')
  })

  it('rejects values that could escape the local database namespace', () => {
    expect(() => databaseNameForScope({ userId: '../user', pairId: 'pair' })).toThrow('Invalid userId')
  })
})
