import type { PowerSyncDatabase } from '@powersync/web'
import { describe, expect, it, vi } from 'vitest'
import { applyLocalMutation, coalesceMutationOperation } from './applyLocalMutation'
import { createMutationEnvelope } from './types'

const scope = {
  pairId: '20000000-0000-4000-8000-000000000002',
  actorUserId: '10000000-0000-4000-8000-000000000001',
}

function fakeDatabase(pending: unknown = null) {
  const execute = vi.fn(async () => ({ rowsAffected: 1 }))
  const getOptional = vi.fn(async () => pending)
  const db = {
    writeTransaction: async <T>(callback: (tx: { execute: typeof execute; getOptional: typeof getOptional }) => Promise<T>) => callback({ execute, getOptional }),
  } as unknown as PowerSyncDatabase
  return { db, execute, getOptional }
}

describe('applyLocalMutation', () => {
  it('writes the entity and semantic outbox in the same transaction callback', async () => {
    const { db, execute } = fakeDatabase()
    const envelope = createMutationEnvelope({
      mutationId: '30000000-0000-4000-8000-000000000003',
      createdAt: '2026-08-07T21:00:00.000Z',
      ...scope,
      entityType: 'recipes',
      entityId: '40000000-0000-4000-8000-000000000004',
      operation: 'create',
      baseRevision: null,
      base: null,
      next: {
        pair_id: scope.pairId,
        revision: 0,
        title: 'Bolo',
        created_by: scope.actorUserId,
        created_at: '2026-08-07T21:00:00.000Z',
        updated_at: '2026-08-07T21:00:00.000Z',
        deleted_at: null,
      },
    })

    const mutationId = await applyLocalMutation(db, envelope)
    expect(mutationId).toBe(envelope.mutationId)
    expect(execute.mock.calls.some(([sql]) => String(sql).startsWith('INSERT INTO "recipes"'))).toBe(true)
    expect(execute.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO mutation_outbox'))).toBe(true)
  })

  it('rejects spoofed authorship on create before touching the database', async () => {
    const { db, execute } = fakeDatabase()
    const envelope = createMutationEnvelope({
      mutationId: '30000000-0000-4000-8000-000000000003',
      ...scope,
      entityType: 'recipes',
      entityId: '40000000-0000-4000-8000-000000000004',
      operation: 'create',
      baseRevision: null,
      base: null,
      next: { pair_id: scope.pairId, revision: 0, title: 'Bolo', created_by: '90000000-0000-4000-8000-000000000009' },
    })

    await expect(applyLocalMutation(db, envelope)).rejects.toThrow('created_by')
    expect(execute).not.toHaveBeenCalled()
  })

  it('allows a partner to edit a recipe while preserving the original creator', async () => {
    const creator = '90000000-0000-4000-8000-000000000009'
    const { db, execute } = fakeDatabase()
    const base = {
      pair_id: scope.pairId,
      revision: 4,
      title: 'Bolo antigo',
      created_by: creator,
      created_at: '2026-08-01T10:00:00.000Z',
      updated_at: '2026-08-01T10:00:00.000Z',
      deleted_at: null,
    }
    const envelope = createMutationEnvelope({
      ...scope,
      entityType: 'recipes',
      entityId: '40000000-0000-4000-8000-000000000004',
      operation: 'update',
      baseRevision: 4,
      base,
      next: { ...base, title: 'Bolo editado pelo parceiro', updated_at: '2026-08-07T21:00:00.000Z' },
    })

    await applyLocalMutation(db, envelope)
    expect(execute.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE "recipes"'))).toBe(true)
  })

  it('rejects rewriting historical creator during an edit', async () => {
    const creator = '90000000-0000-4000-8000-000000000009'
    const { db } = fakeDatabase()
    const base = { pair_id: scope.pairId, revision: 4, title: 'Bolo', created_by: creator }
    const envelope = createMutationEnvelope({
      ...scope,
      entityType: 'recipes',
      entityId: '40000000-0000-4000-8000-000000000004',
      operation: 'update',
      baseRevision: 4,
      base,
      next: { ...base, created_by: scope.actorUserId },
    })

    await expect(applyLocalMutation(db, envelope)).rejects.toThrow('immutable')
  })

  it('coalesces later edits without losing the original mutation id/base', async () => {
    const pending = {
      id: '30000000-0000-4000-8000-000000000003',
      pair_id: scope.pairId,
      actor_user_id: scope.actorUserId,
      operation: 'create',
      base_revision: null,
      base_payload: null,
      next_payload: JSON.stringify({ pair_id: scope.pairId, revision: 0, title: 'Bolo', created_by: scope.actorUserId }),
      created_at: '2026-08-07T21:00:00.000Z',
    }
    const { db, execute } = fakeDatabase(pending)
    const envelope = createMutationEnvelope({
      mutationId: '31000000-0000-4000-8000-000000000003',
      ...scope,
      entityType: 'recipes',
      entityId: '40000000-0000-4000-8000-000000000004',
      operation: 'update',
      baseRevision: null,
      base: null,
      next: { pair_id: scope.pairId, revision: 0, title: 'Bolo melhor', created_by: scope.actorUserId },
    })

    const mutationId = await applyLocalMutation(db, envelope)
    expect(mutationId).toBe(pending.id)
    expect(execute.mock.calls.some(([sql, params]) => String(sql).includes('UPDATE mutation_outbox') && (params as unknown[])[0] === 'create')).toBe(true)
  })
})

describe('coalesceMutationOperation', () => {
  it('keeps a locally-created entity as create through later edits/deletion', () => {
    expect(coalesceMutationOperation('create', 'update')).toBe('create')
    expect(coalesceMutationOperation('create', 'soft_delete')).toBe('create')
  })

  it('promotes an update to soft delete and never resurrects a pending delete', () => {
    expect(coalesceMutationOperation('update', 'soft_delete')).toBe('soft_delete')
    expect(() => coalesceMutationOperation('soft_delete', 'update')).toThrow('after a pending soft delete')
  })
})
