import { describe, expect, it } from 'vitest'
import { databaseNameForScope } from './database'

const pairId = '20000000-0000-4000-8000-000000000002'

describe('databaseNameForScope', () => {
  it('creates a deterministic isolated filename from authenticated UUIDs', () => {
    expect(databaseNameForScope({
      userId: '10000000-0000-4000-8000-000000000001',
      pairId,
    })).toBe('receitas-10000000-0000-4000-8000-000000000001-20000000-0000-4000-8000-000000000002.db')
  })

  it('uses a different local database for a different identity even inside the same pair', () => {
    const first = databaseNameForScope({
      userId: '10000000-0000-4000-8000-000000000001',
      pairId,
    })
    const second = databaseNameForScope({
      userId: '10000000-0000-4000-8000-000000000003',
      pairId,
    })

    expect(second).not.toBe(first)
  })

  it('rejects values that could escape the local database namespace', () => {
    expect(() => databaseNameForScope({ userId: '../user', pairId: 'pair' })).toThrow('Invalid userId')
  })
})
