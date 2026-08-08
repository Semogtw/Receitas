import type { PowerSyncDatabase } from '@powersync/web'
import { describe, expect, it, vi } from 'vitest'
import type { MutationEnvelope } from '../../../data/mutations/types'
import { CategoryRepository } from './category-repository'

const scope = {
  pairId: '20000000-0000-4000-8000-000000000002',
  actorUserId: '10000000-0000-4000-8000-000000000001',
}
const recipeId = '40000000-0000-4000-8000-000000000004'
const dessert = '70000000-0000-4000-8000-000000000007'
const quick = '70000000-0000-4000-8000-000000000008'
const dessertLink = '80000000-0000-4000-8000-000000000008'
const quickLink = '80000000-0000-4000-8000-000000000009'

function fakeDatabase(links: Record<string, unknown>[]) {
  return {
    getAll: vi.fn(async (sql: string) => sql.includes('recipe_categories') ? links : []),
    getOptional: vi.fn(async (sql: string) => {
      if (sql.includes('mutation_outbox')) return null
      const id = sql.includes('recipe_categories') ? undefined : null
      return id
    }),
  } as unknown as PowerSyncDatabase
}

describe('recipe category selection', () => {
  it('reads only active category ids for the recipe', async () => {
    const repository = new CategoryRepository(fakeDatabase([
      { id: dessertLink, recipe_id: recipeId, category_id: dessert, deleted_at: null },
      { id: quickLink, recipe_id: recipeId, category_id: quick, deleted_at: '2026-08-07T20:00:00.000Z' },
    ]), scope)

    await expect(repository.listRecipeCategoryIds(recipeId)).resolves.toEqual([dessert])
  })

  it('soft deletes deselected links and restores the same id when a deleted assignment is selected again', async () => {
    const links = [
      {
        id: dessertLink, pair_id: scope.pairId, revision: 2, recipe_id: recipeId, category_id: dessert,
        created_at: '2026-08-07T18:00:00.000Z', updated_at: '2026-08-07T19:00:00.000Z', deleted_at: null,
      },
      {
        id: quickLink, pair_id: scope.pairId, revision: 3, recipe_id: recipeId, category_id: quick,
        created_at: '2026-08-07T18:00:00.000Z', updated_at: '2026-08-07T19:00:00.000Z', deleted_at: '2026-08-07T20:00:00.000Z',
      },
    ]
    const envelopes: MutationEnvelope[] = []
    const database = {
      getAll: vi.fn(async () => links),
      getOptional: vi.fn(async (sql: string) => sql.includes('mutation_outbox') ? null : null),
    } as unknown as PowerSyncDatabase
    const writer = vi.fn(async (_db: PowerSyncDatabase, envelope: MutationEnvelope) => {
      envelopes.push(envelope)
      return envelope.mutationId
    })
    const repository = new CategoryRepository(database, scope, writer)

    await repository.setRecipeCategories(recipeId, [quick])

    expect(envelopes).toHaveLength(2)
    expect(envelopes).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityId: dessertLink, operation: 'soft_delete' }),
      expect.objectContaining({ entityId: quickLink, operation: 'update', next: expect.objectContaining({ deleted_at: null }) }),
    ]))
  })
})
