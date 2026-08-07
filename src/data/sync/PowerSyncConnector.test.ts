import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReceitasPowerSyncConnector } from './PowerSyncConnector'

const getSession = vi.hoisted(() => vi.fn())
const rpc = vi.hoisted(() => vi.fn())

vi.mock('../../lib/env', () => ({
  readPublicEnv: () => ({
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'sb_publishable_test',
    powersyncUrl: 'https://sync.example.test',
  }),
}))

vi.mock('../../lib/supabase/client', () => ({
  getSupabaseClient: () => ({ auth: { getSession }, rpc }),
}))

const scope = {
  userId: '10000000-0000-4000-8000-000000000001',
  pairId: '20000000-0000-4000-8000-000000000002',
}

const pending = {
  id: '30000000-0000-4000-8000-000000000003',
  pair_id: scope.pairId,
  actor_user_id: scope.userId,
  entity_type: 'recipes',
  entity_id: '40000000-0000-4000-8000-000000000004',
  operation: 'update' as const,
  base_revision: 2,
  base_payload: JSON.stringify({ pair_id: scope.pairId, revision: 2, title: 'Antes' }),
  next_payload: JSON.stringify({ pair_id: scope.pairId, revision: 2, title: 'Depois' }),
  created_at: '2026-08-07T21:00:00.000Z',
}

function fakeDatabase(options: { pending?: typeof pending | null; rpcCrud?: Array<{ table: string; id: string }> } = {}) {
  const complete = vi.fn(async () => undefined)
  const execute = vi.fn(async () => ({ rowsAffected: 1 }))
  const getOptional = vi.fn(async () => options.pending === undefined ? pending : options.pending)
  const getNextCrudTransaction = vi.fn(async () => ({
    crud: options.rpcCrud ?? [{ table: 'recipes', id: pending.entity_id }],
    complete,
  }))

  return {
    database: { getNextCrudTransaction, getOptional, execute },
    getNextCrudTransaction,
    getOptional,
    execute,
    complete,
  }
}

describe('ReceitasPowerSyncConnector', () => {
  beforeEach(() => {
    getSession.mockReset().mockResolvedValue({
      data: { session: { access_token: 'supabase-access-token' } },
      error: null,
    })
    rpc.mockReset().mockResolvedValue({
      data: [{ result_status: 'applied', resulting_revision: 3, conflict_id: null }],
      error: null,
    })
  })

  it('reuses the current Supabase access token for PowerSync credentials', async () => {
    const connector = new ReceitasPowerSyncConnector(scope)
    await expect(connector.fetchCredentials()).resolves.toEqual({
      endpoint: 'https://sync.example.test',
      token: 'supabase-access-token',
    })
  })

  it('uploads the semantic envelope before acknowledging the CRUD transaction', async () => {
    const connector = new ReceitasPowerSyncConnector(scope)
    const fake = fakeDatabase()

    await connector.uploadData(fake.database as never)

    expect(rpc).toHaveBeenCalledWith('apply_client_mutation', expect.objectContaining({
      p_mutation_id: pending.id,
      p_pair_id: scope.pairId,
      p_actor_user_id: scope.userId,
      p_entity_type: 'recipes',
      p_entity_id: pending.entity_id,
      p_operation: 'update',
      p_base_revision: 2,
    }))
    expect(fake.execute).toHaveBeenCalledWith(
      'DELETE FROM mutation_outbox WHERE id = ? AND next_payload = ?',
      [pending.id, pending.next_payload],
    )
    expect(fake.complete).toHaveBeenCalledTimes(1)
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(fake.complete.mock.invocationCallOrder[0])
  })

  it('acknowledges an explicit conflict because both versions are already preserved remotely', async () => {
    rpc.mockResolvedValue({
      data: [{ result_status: 'conflict_created', resulting_revision: null, conflict_id: '50000000-0000-4000-8000-000000000005' }],
      error: null,
    })
    const connector = new ReceitasPowerSyncConnector(scope)
    const fake = fakeDatabase()

    await connector.uploadData(fake.database as never)

    expect(fake.execute).toHaveBeenCalledWith(
      'DELETE FROM mutation_outbox WHERE id = ? AND next_payload = ?',
      [pending.id, pending.next_payload],
    )
    expect(fake.complete).toHaveBeenCalledTimes(1)
  })

  it('completes redundant CRUD entries already covered by a coalesced semantic upload', async () => {
    const connector = new ReceitasPowerSyncConnector(scope)
    const fake = fakeDatabase({ pending: null })

    await connector.uploadData(fake.database as never)

    expect(rpc).not.toHaveBeenCalled()
    expect(fake.complete).toHaveBeenCalledTimes(1)
  })

  it('keeps the CRUD transaction pending and records only a sanitized retry marker on RPC failure', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('network details that must not be cached') })
    const connector = new ReceitasPowerSyncConnector(scope)
    const fake = fakeDatabase()

    await expect(connector.uploadData(fake.database as never)).rejects.toThrow()

    expect(fake.complete).not.toHaveBeenCalled()
    expect(fake.execute).toHaveBeenCalledWith(
      expect.stringContaining("last_error = 'upload_failed'"),
      ['recipes', pending.entity_id],
    )
    expect(JSON.stringify(fake.execute.mock.calls)).not.toContain('network details')
  })

  it('rejects an outbox row from another authenticated scope', async () => {
    const connector = new ReceitasPowerSyncConnector(scope)
    const fake = fakeDatabase({ pending: { ...pending, pair_id: '90000000-0000-4000-8000-000000000009' } })

    await expect(connector.uploadData(fake.database as never)).rejects.toThrow('scope')
    expect(rpc).not.toHaveBeenCalled()
    expect(fake.complete).not.toHaveBeenCalled()
  })
})
