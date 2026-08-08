import type { PowerSyncDatabase } from '@powersync/web'
import { describe, expect, it, vi } from 'vitest'
import type { MutationEnvelope } from '../../data/mutations/types'
import { TrashRepository } from './trash-repository'

const scope = {
  pairId: '20000000-0000-4000-8000-000000000002',
  actorUserId: '10000000-0000-4000-8000-000000000001',
}
const recipeId = '40000000-0000-4000-8000-000000000004'

function databaseFixture(options?: { deleted?: boolean; pendingCount?: number }) {
  const row = {
    id: recipeId,
    pair_id: scope.pairId,
    revision: 3,
    title: 'Bolo simples',
    updated_at: '2026-08-07T21:00:00.000Z',
    deleted_at: options?.deleted ? '2026-08-07T22:00:00.000Z' : null,
  }

  return {
    getOptional: vi.fn(async (sql: string) => {
      if (sql.includes('mutation_outbox')) return null
      if (sql.includes('FROM recipes')) return row
      return null
    }),
    get: vi.fn(async (sql: string) => {
      if (sql.includes('mutation_outbox')) return { count: options?.pendingCount ?? 0 }
      throw new Error(`Unexpected query: ${sql}`)
    }),
    getAll: vi.fn(async (sql: string) => sql.includes('FROM recipes') && options?.deleted ? [row] : []),
  } as unknown as PowerSyncDatabase
}

describe('TrashRepository', () => {
  it('soft deletes through a semantic mutation and preserves the row for recovery', async () => {
    const envelopes: MutationEnvelope[] = []
    const writer = vi.fn(async (_db: PowerSyncDatabase, envelope: MutationEnvelope) => {
      envelopes.push(envelope)
      return envelope.mutationId
    })
    const repository = new TrashRepository(databaseFixture(), scope, writer)

    await repository.softDelete('recipes', recipeId)

    expect(envelopes[0]).toMatchObject({ entityType: 'recipes', entityId: recipeId, operation: 'soft_delete', baseRevision: 3 })
    expect(typeof envelopes[0]?.next.deleted_at).toBe('string')
  })

  it('restores a deleted row with a normal versioned update', async () => {
    const envelopes: MutationEnvelope[] = []
    const writer = vi.fn(async (_db: PowerSyncDatabase, envelope: MutationEnvelope) => {
      envelopes.push(envelope)
      return envelope.mutationId
    })
    const repository = new TrashRepository(databaseFixture({ deleted: true }), scope, writer)

    await repository.restore('recipes', recipeId)

    expect(envelopes[0]).toMatchObject({ entityType: 'recipes', entityId: recipeId, operation: 'update', baseRevision: 3 })
    expect(envelopes[0]?.next.deleted_at).toBeNull()
  })

  it('lists deleted entities with a human-readable label and no automatic expiry', async () => {
    const repository = new TrashRepository(databaseFixture({ deleted: true }), scope)

    const entries = await repository.listTrash()

    expect(entries).toContainEqual(expect.objectContaining({
      entityType: 'recipes',
      entityId: recipeId,
      label: 'Bolo simples',
      deletedAt: '2026-08-07T22:00:00.000Z',
    }))
  })

  it('refuses permanent deletion while the entity still has unsynced local work', async () => {
    const gateway = vi.fn(async () => undefined)
    const repository = new TrashRepository(databaseFixture({ deleted: true, pendingCount: 1 }), scope, undefined, gateway)

    await expect(repository.permanentlyDelete('recipes', recipeId)).rejects.toThrow('pending local mutation')
    expect(gateway).not.toHaveBeenCalled()
  })

  it('delegates permanent deletion to the privileged backend only for an already deleted, fully synced row', async () => {
    const gateway = vi.fn(async () => undefined)
    const repository = new TrashRepository(databaseFixture({ deleted: true }), scope, undefined, gateway)

    await repository.permanentlyDelete('recipes', recipeId)

    expect(gateway).toHaveBeenCalledWith('recipes', recipeId, scope.pairId)
  })
})
