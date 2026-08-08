import type { PowerSyncDatabase } from '@powersync/web'
import { describe, expect, it, vi } from 'vitest'
import type { CookingDraft } from '../domain/cooking-draft'
import { LocalCookingDraftStore } from './local-cooking-draft-store'

const draft: CookingDraft = {
  version: 1,
  id: 'draft-a',
  finalizationSessionId: 'session-a',
  recipeSnapshot: {
    version: 1,
    recipeId: 'recipe-a',
    recipeRevision: 2,
    title: 'Bolo',
    description: null,
    baseYield: { numerator: 4, denominator: 1 },
    baseYieldUnit: 'porções',
    prepTimeSeconds: 600,
    cookTimeSeconds: 1200,
    totalTimeSeconds: 1800,
    ingredients: [],
    steps: [],
  },
  startedAt: '2026-08-07T20:00:00.000Z',
  currentStepIndex: 0,
  servingMultiplier: { numerator: 1, denominator: 1 },
  timers: [],
}

describe('LocalCookingDraftStore', () => {
  it('stores one active draft in local-only device preferences', async () => {
    const execute = vi.fn(async () => undefined)
    const database = { execute, getOptional: vi.fn(async () => null) } as unknown as PowerSyncDatabase
    const store = new LocalCookingDraftStore(database)

    await store.save(draft)

    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0]?.[0]).toContain('device_preferences')
    expect(execute.mock.calls[0]?.[0]).toContain('active_cooking_draft')
    expect(JSON.parse(String(execute.mock.calls[0]?.[1]?.[0]))).toEqual(draft)
  })

  it('loads a valid persisted draft and rejects malformed data', async () => {
    const validDatabase = {
      execute: vi.fn(),
      getOptional: vi.fn(async () => ({ value_json: JSON.stringify(draft) })),
    } as unknown as PowerSyncDatabase
    const malformedDatabase = {
      execute: vi.fn(),
      getOptional: vi.fn(async () => ({ value_json: '{"version":99}' })),
    } as unknown as PowerSyncDatabase

    await expect(new LocalCookingDraftStore(validDatabase).load()).resolves.toEqual(draft)
    await expect(new LocalCookingDraftStore(malformedDatabase).load()).rejects.toThrow('draft')
  })

  it('clears only the active cooking draft key', async () => {
    const execute = vi.fn(async () => undefined)
    const database = { execute, getOptional: vi.fn(async () => null) } as unknown as PowerSyncDatabase
    const store = new LocalCookingDraftStore(database)

    await store.clear()

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM device_preferences'),
      [],
    )
    expect(execute.mock.calls[0]?.[0]).toContain("id = 'active_cooking_draft'")
  })
})
