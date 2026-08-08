import type { PowerSyncDatabase } from '@powersync/web'
import { describe, expect, it, vi } from 'vitest'
import type { MutationEnvelope } from '../../../data/mutations/types'
import { ConversionProfileRepository } from './conversion-profile-repository'

const scope = {
  pairId: '20000000-0000-4000-8000-000000000002',
  actorUserId: '10000000-0000-4000-8000-000000000001',
}
const profileId = '90000000-0000-4000-8000-000000000009'

function fakeDatabase(existing: Record<string, unknown> | null = null) {
  return {
    getOptional: vi.fn(async (sql: string) => sql.includes('mutation_outbox') ? null : existing),
    getAll: vi.fn(async () => existing ? [existing] : []),
  } as unknown as PowerSyncDatabase
}

describe('ConversionProfileRepository', () => {
  it('maps exact pair density factors to conversion profiles', async () => {
    const row = {
      id: profileId,
      pair_id: scope.pairId,
      revision: 2,
      ingredient_normalized_name: 'farinha',
      from_unit: 'ml',
      to_unit: 'g',
      factor_numerator: 5,
      factor_denominator: 8,
      is_approximate: 1,
      source_note: 'Medido em casa',
      created_at: '2026-08-07T20:00:00.000Z',
      updated_at: '2026-08-07T21:00:00.000Z',
      deleted_at: null,
    }
    const repository = new ConversionProfileRepository(fakeDatabase(row), scope)

    await expect(repository.listDensityProfiles()).resolves.toEqual([
      { ingredientKey: 'farinha', gramsPerMilliliter: 0.625, source: 'pair_override' },
    ])
  })

  it('creates an exact semantic density override when none exists', async () => {
    const envelopes: MutationEnvelope[] = []
    const writer = vi.fn(async (_db: PowerSyncDatabase, envelope: MutationEnvelope) => {
      envelopes.push(envelope)
      return envelope.mutationId
    })
    const repository = new ConversionProfileRepository(fakeDatabase(), scope, writer)

    const id = await repository.setDensityProfile({
      id: profileId,
      ingredientKey: 'Farinha',
      gramsPerMilliliter: 0.625,
      sourceNote: 'Medido em casa',
    })

    expect(id).toBe(profileId)
    expect(envelopes[0]).toMatchObject({ entityType: 'ingredient_conversion_profiles', entityId: profileId, operation: 'create' })
    expect(envelopes[0]?.next).toMatchObject({
      ingredient_normalized_name: 'farinha',
      from_unit: 'ml',
      to_unit: 'g',
      factor_numerator: 5,
      factor_denominator: 8,
      is_approximate: 1,
    })
  })

  it('updates the existing profile id rather than creating duplicates', async () => {
    const existing = {
      id: profileId,
      pair_id: scope.pairId,
      revision: 4,
      ingredient_normalized_name: 'farinha',
      from_unit: 'ml',
      to_unit: 'g',
      factor_numerator: 1,
      factor_denominator: 2,
      is_approximate: 1,
      source_note: null,
      created_at: '2026-08-07T20:00:00.000Z',
      updated_at: '2026-08-07T21:00:00.000Z',
      deleted_at: null,
    }
    const envelopes: MutationEnvelope[] = []
    const writer = vi.fn(async (_db: PowerSyncDatabase, envelope: MutationEnvelope) => {
      envelopes.push(envelope)
      return envelope.mutationId
    })
    const repository = new ConversionProfileRepository(fakeDatabase(existing), scope, writer)

    const id = await repository.setDensityProfile({ ingredientKey: 'FARINHA', gramsPerMilliliter: 0.625 })

    expect(id).toBe(profileId)
    expect(envelopes[0]).toMatchObject({ entityId: profileId, operation: 'update', baseRevision: 4 })
    expect(envelopes[0]?.next).toMatchObject({ factor_numerator: 5, factor_denominator: 8 })
  })
})
