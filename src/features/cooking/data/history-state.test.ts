import type { PowerSyncDatabase } from '@powersync/web'
import { describe, expect, it, vi } from 'vitest'
import { listCookedRecipeIds } from './history-state'

const pairId = '20000000-0000-4000-8000-000000000002'

describe('cooking history derived state', () => {
  it('derives already-made recipe ids only from active cooking sessions', async () => {
    const database = {
      getAll: vi.fn(async () => [
        { recipe_id: 'recipe-a' },
        { recipe_id: 'recipe-b' },
        { recipe_id: 'recipe-a' },
      ]),
    } as unknown as PowerSyncDatabase

    const cooked = await listCookedRecipeIds(database, pairId)

    expect([...cooked]).toEqual(['recipe-a', 'recipe-b'])
    expect(vi.mocked(database.getAll).mock.calls[0]?.[0]).toContain('deleted_at IS NULL')
    expect(vi.mocked(database.getAll).mock.calls[0]?.[1]).toEqual([pairId])
  })

  it('returns an empty set when no active session exists', async () => {
    const database = { getAll: vi.fn(async () => []) } as unknown as PowerSyncDatabase
    await expect(listCookedRecipeIds(database, pairId)).resolves.toEqual(new Set())
  })
})
