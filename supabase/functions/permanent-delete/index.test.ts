import {
  cleanupPendingMediaDeletes,
  createPermanentDeleteHandler,
  parsePermanentDeleteRequest,
} from './index.ts'

function assert(condition: unknown, message = 'Assertion failed'): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEquals(actual: unknown, expected: unknown, message = 'Values differ'): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

Deno.test('parsePermanentDeleteRequest rejects unsupported entities and invalid ids', () => {
  const valid = parsePermanentDeleteRequest({
    entityType: 'recipe_photos',
    entityId: '40000000-0000-4000-8000-000000000004',
  })
  assertEquals(valid.entityType, 'recipe_photos')

  for (const body of [
    { entityType: 'pair_members', entityId: '40000000-0000-4000-8000-000000000004' },
    { entityType: 'recipes', entityId: 'not-a-uuid' },
  ]) {
    let failed = false
    try {
      parsePermanentDeleteRequest(body)
    } catch {
      failed = true
    }
    assert(failed, 'invalid permanent-delete request should fail')
  }
})

Deno.test('handler derives pair server-side and ignores a malicious browser pairId', async () => {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []
  const pairChain = {
    select() { return this },
    eq() { return this },
    is() { return this },
    not() { return this },
    async limit() {
      return { data: [{ pair_id: '20000000-0000-4000-8000-000000000002' }], error: null }
    },
  }

  const client = {
    from: () => pairChain,
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args })
      if (name === 'permanently_delete_entity_server') return { data: null, error: null }
      if (name === 'read_media_delete_queue_server') return { data: [], error: null }
      throw new Error(`unexpected rpc ${name}`)
    },
    storage: {
      from: () => ({ remove: async () => ({ data: [], error: null }) }),
    },
  }

  const handler = createPermanentDeleteHandler({
    getClient: () => client as never,
    getUserId: async () => '10000000-0000-4000-8000-000000000001',
  })
  const response = await handler(new Request('https://edge.invalid/permanent-delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      entityType: 'recipes',
      entityId: '40000000-0000-4000-8000-000000000004',
      pairId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    }),
  }))

  assertEquals(response.status, 200)
  const deleteCall = rpcCalls.find((call) => call.name === 'permanently_delete_entity_server')
  assert(deleteCall, 'delete RPC was not called')
  assertEquals(deleteCall.args.p_pair_id, '20000000-0000-4000-8000-000000000002')
  assertEquals(deleteCall.args.p_actor_user_id, '10000000-0000-4000-8000-000000000001')
  assert(!('pairId' in deleteCall.args), 'browser pairId must never reach the server RPC')
})

Deno.test('cleanup action retries the private queue without exposing paths', async () => {
  let queueRead = 0
  const pairChain = {
    select() { return this },
    eq() { return this },
    is() { return this },
    not() { return this },
    async limit() {
      return { data: [{ pair_id: '20000000-0000-4000-8000-000000000002' }], error: null }
    },
  }
  const client = {
    from: () => pairChain,
    rpc: async (name: string) => {
      if (name === 'read_media_delete_queue_server') {
        queueRead += 1
        return queueRead === 1
          ? { data: [{ storage_path: 'pairs/pair-a/recipes/recipe-a/photo.webp' }], error: null }
          : { data: [], error: null }
      }
      if (name === 'mark_media_delete_complete_server') return { data: null, error: null }
      throw new Error(`unexpected rpc ${name}`)
    },
    storage: {
      from: () => ({ remove: async () => ({ data: [], error: null }) }),
    },
  }

  const handler = createPermanentDeleteHandler({
    getClient: () => client as never,
    getUserId: async () => '10000000-0000-4000-8000-000000000001',
  })
  const response = await handler(new Request('https://edge.invalid/permanent-delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'cleanup', pairId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }),
  }))

  assertEquals(response.status, 200)
  const body = await response.json()
  assertEquals(body, { ok: true, cleanupPending: false })
  assert(!JSON.stringify(body).includes('storage_path'), 'private cleanup paths must not be returned')
})

Deno.test('cleanup queue keeps a failed Storage removal retryable', async () => {
  const calls: string[] = []
  const client = {
    rpc: async (name: string) => {
      calls.push(name)
      if (name === 'read_media_delete_queue_server') {
        return { data: [{ storage_path: 'pairs/pair-a/recipes/recipe-a/photo.webp' }], error: null }
      }
      if (name === 'mark_media_delete_failed_server') return { data: null, error: null }
      if (name === 'mark_media_delete_complete_server') throw new Error('must not complete failed removal')
      throw new Error(`unexpected rpc ${name}`)
    },
    storage: {
      from: () => ({
        remove: async () => ({ data: null, error: { message: 'temporary storage error' } }),
      }),
    },
  }

  const result = await cleanupPendingMediaDeletes(
    client as never,
    '20000000-0000-4000-8000-000000000002',
  )

  assertEquals(result, { attempted: 1, remaining: 1 })
  assert(calls.includes('mark_media_delete_failed_server'))
  assert(!calls.includes('mark_media_delete_complete_server'))
})
