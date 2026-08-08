import type { PowerSyncDatabase } from '@powersync/web'
import { describe, expect, it, vi } from 'vitest'
import type { MutationEnvelope } from '../../../data/mutations/types'
import { CategoryRepository } from './category-repository'

const scope = {
  pairId: '20000000-0000-4000-8000-000000000002',
  actorUserId: '10000000-0000-4000-8000-000000000001',
}
const categoryId = '70000000-0000-4000-8000-000000000007'
const recipeId = '40000000-0000-4000-8000-000000000004'
const linkId = '80000000-0000-4000-8000-000000000008'

function fakeDatabase(row: Record<string, unknown> | null = null, links: Record<string, unknown>[] = []) {
  return {
    getOptional: vi.fn(async (sql: string) => {
      if (sql.includes('mutation_outbox')) return null
      return row
    }),
    getAll: vi.fn(async (sql: string) => sql.includes('recipe_categories') ? links : []),
  } as unknown as PowerSyncDatabase
}

describe('CategoryRepository', () => {
  it('creates categories and recipe links through semantic mutations', async () => {
    const envelopes: MutationEnvelope[] = []
    const writer = vi.fn(async (_db: PowerSyncDatabase, envelope: MutationEnvelope) => {
      envelopes.push(envelope)
      return envelope.mutationId
    })
    const repository = new CategoryRepository(fakeDatabase(), scope, writer)

    await repository.createCategory(categoryId, 'Sobremesas')
    await repository.assignCategory(linkId, recipeId, categoryId)

    expect(envelopes.map((item) => item.entityType)).toEqual(['categories', 'recipe_categories'])
    expect(envelopes[0]?.next.name).toBe('Sobremesas')
    expect(envelopes[1]?.next).toMatchObject({ recipe_id: recipeId, category_id: categoryId })
  })

  it('renames an existing category without replacing its id', async () => {
    const row = {
      id: categoryId, pair_id: scope.pairId, revision: 3, name: 'Doces',
      created_at: '2026-08-07T20:00:00.000Z', updated_at: '2026-08-07T20:00:00.000Z', deleted_at: null,
    }
    const envelopes: MutationEnvelope[] = []
    const writer = vi.fn(async (_db: PowerSyncDatabase, envelope: MutationEnvelope) => {
      envelopes.push(envelope)
      return envelope.mutationId
    })
    const repository = new CategoryRepository(fakeDatabase(row), scope, writer)

    await repository.renameCategory(categoryId, 'Sobremesas')

    expect(envelopes[0]).toMatchObject({ entityType: 'categories', entityId: categoryId, operation: 'update' })
    expect(envelopes[0]?.next.name).toBe('Sobremesas')
  })

  it('soft deletes category links together with the category without deleting recipes', async () => {
    const row = {
      id: categoryId, pair_id: scope.pairId, revision: 3, name: 'Doces',
      created_at: '2026-08-07T20:00:00.000Z', updated_at: '2026-08-07T20:00:00.000Z', deleted_at: null,
    }
    const link = {
      id: linkId, pair_id: scope.pairId, revision: 1, recipe_id: recipeId, category_id: categoryId,
      created_at: row.created_at, updated_at: row.updated_at, deleted_at: null,
    }
    const envelopes: MutationEnvelope[] = []
    const writer = vi.fn(async (_db: PowerSyncDatabase, envelope: MutationEnvelope) => {
      envelopes.push(envelope)
      return envelope.mutationId
    })
    const repository = new CategoryRepository(fakeDatabase(row, [link]), scope, writer)

    await repository.softDeleteCategory(categoryId)

    expect(envelopes.some((item) => item.entityType === 'categories' && item.operation === 'soft_delete')).toBe(true)
    expect(envelopes.some((item) => item.entityType === 'recipe_categories' && item.operation === 'soft_delete')).toBe(true)
    expect(envelopes.some((item) => item.entityType === 'recipes')).toBe(false)
  })
})
