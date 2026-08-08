import { describe, expect, it, vi } from 'vitest'
import type { JsonObject } from './types'
import { resolveMutationBase } from './resolveMutationBase'

function fakeDatabase(pending: unknown) {
  return {
    getOptional: vi.fn(async () => pending),
  }
}

const current: JsonObject = {
  pair_id: '20000000-0000-4000-8000-000000000002',
  revision: 7,
  title: 'Versão local atual',
}

describe('resolveMutationBase', () => {
  it('uses the original remote base while a semantic mutation is pending', async () => {
    const base = { pair_id: current.pair_id, revision: 4, title: 'Base remota' }
    const database = fakeDatabase({ base_revision: 4, base_payload: JSON.stringify(base) })

    await expect(resolveMutationBase(database, 'recipes', '40000000-0000-4000-8000-000000000004', current))
      .resolves.toEqual({ baseRevision: 4, base })
  })

  it('preserves a pending local create as a null remote base', async () => {
    const database = fakeDatabase({ base_revision: null, base_payload: null })

    await expect(resolveMutationBase(database, 'recipes', '40000000-0000-4000-8000-000000000004', current))
      .resolves.toEqual({ baseRevision: null, base: null })
  })

  it('uses the current synchronized row when there is no pending mutation', async () => {
    const database = fakeDatabase(null)

    await expect(resolveMutationBase(database, 'recipes', '40000000-0000-4000-8000-000000000004', current))
      .resolves.toEqual({ baseRevision: 7, base: current })
  })

  it('returns a null base for a genuinely new entity', async () => {
    const database = fakeDatabase(null)

    await expect(resolveMutationBase(database, 'recipes', '40000000-0000-4000-8000-000000000004', null))
      .resolves.toEqual({ baseRevision: null, base: null })
  })
})
