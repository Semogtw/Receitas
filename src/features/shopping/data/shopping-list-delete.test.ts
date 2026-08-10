import type { PowerSyncDatabase } from '@powersync/web'
import { describe, expect, it, vi } from 'vitest'
import type { MutationEnvelope } from '../../../data/mutations/types'
import { ShoppingRepository } from './shopping-repository'

const scope = {
  pairId: '20000000-0000-4000-8000-000000000002',
  actorUserId: '10000000-0000-4000-8000-000000000001',
}

function row(id: string, name: string, isDefault: boolean) {
  return {
    id,
    pair_id: scope.pairId,
    name,
    is_default: isDefault ? 1 : 0,
    completed_at: null,
    revision: 1,
    created_at: '2026-08-10T10:00:00.000Z',
    updated_at: '2026-08-10T10:00:00.000Z',
    deleted_at: null,
  }
}

function databaseFixture(target: ReturnType<typeof row>, remaining: ReturnType<typeof row>[]) {
  return {
    getOptional: vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('mutation_outbox')) return null
      if (sql.includes('shopping_lists') && params?.[0] === target.id) return target
      return null
    }),
    getAll: vi.fn(async (sql: string) => {
      if (sql.includes('shopping_lists')) return remaining
      return []
    }),
  } as unknown as PowerSyncDatabase
}

function writerInto(envelopes: MutationEnvelope[]) {
  return vi.fn(async (_database: PowerSyncDatabase, envelope: MutationEnvelope) => {
    envelopes.push(envelope)
    return envelope.mutationId
  })
}

describe('ShoppingRepository.softDeleteShoppingList', () => {
  it('soft deletes a non-default list without changing another default', async () => {
    const target = row('71000000-0000-4000-8000-000000000001', 'Feira', false)
    const currentDefault = row('71000000-0000-4000-8000-000000000002', 'Mercado', true)
    const envelopes: MutationEnvelope[] = []
    const repository = new ShoppingRepository(databaseFixture(target, [currentDefault]), scope, writerInto(envelopes))

    await repository.softDeleteShoppingList(target.id)

    expect(envelopes).toHaveLength(1)
    expect(envelopes[0]).toMatchObject({
      entityType: 'shopping_lists',
      entityId: target.id,
      operation: 'soft_delete',
    })
    expect(envelopes[0]?.next.is_default).toBe(0)
    expect(typeof envelopes[0]?.next.deleted_at).toBe('string')
  })

  it('promotes a remaining list before soft deleting the current default', async () => {
    const target = row('71000000-0000-4000-8000-000000000001', 'Mercado', true)
    const fallback = row('71000000-0000-4000-8000-000000000002', 'Atacado', false)
    const envelopes: MutationEnvelope[] = []
    const repository = new ShoppingRepository(databaseFixture(target, [fallback]), scope, writerInto(envelopes))

    await repository.softDeleteShoppingList(target.id)

    expect(envelopes).toHaveLength(2)
    expect(envelopes[0]).toMatchObject({
      entityType: 'shopping_lists',
      entityId: fallback.id,
      operation: 'update',
    })
    expect(envelopes[0]?.next.is_default).toBe(1)
    expect(envelopes[1]).toMatchObject({
      entityType: 'shopping_lists',
      entityId: target.id,
      operation: 'soft_delete',
    })
    expect(envelopes[1]?.next.is_default).toBe(0)
  })
})
