import type { PowerSyncDatabase } from '@powersync/web'
import { describe, expect, it, vi } from 'vitest'
import type { MutationEnvelope } from '../../../data/mutations/types'
import { PlannerRepository } from './planner-repository'

const scope = {
  pairId: '20000000-0000-4000-8000-000000000002',
  actorUserId: '10000000-0000-4000-8000-000000000001',
}
const periodId = '61000000-0000-4000-8000-000000000001'
const entryId = '62000000-0000-4000-8000-000000000001'

const period = {
  id: periodId,
  pair_id: scope.pairId,
  name: 'Jantar',
  position: 1,
  revision: 2,
  created_at: '2026-08-10T10:00:00.000Z',
  updated_at: '2026-08-10T10:00:00.000Z',
  deleted_at: null,
}
const entry = {
  id: entryId,
  pair_id: scope.pairId,
  recipe_id: '40000000-0000-4000-8000-000000000004',
  meal_period_id: periodId,
  planned_date: '2026-08-10',
  planned_time: null,
  servings_numerator: null,
  servings_denominator: null,
  note: null,
  revision: 3,
  created_at: '2026-08-10T10:00:00.000Z',
  updated_at: '2026-08-10T10:00:00.000Z',
  deleted_at: null,
}

function databaseFixture(entries = [entry]) {
  return {
    getOptional: vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('mutation_outbox')) return null
      if (sql.includes('meal_periods') && params?.[0] === periodId) return period
      return null
    }),
    getAll: vi.fn(async (sql: string) => {
      if (sql.includes('meal_plan_entries')) return entries
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

describe('PlannerRepository.softDeleteMealPeriod', () => {
  it('moves active entries to Sem período before soft deleting the period', async () => {
    const envelopes: MutationEnvelope[] = []
    const repository = new PlannerRepository(databaseFixture(), scope, writerInto(envelopes))

    await repository.softDeleteMealPeriod(periodId)

    expect(envelopes).toHaveLength(2)
    expect(envelopes[0]).toMatchObject({
      entityType: 'meal_plan_entries',
      entityId: entryId,
      operation: 'update',
    })
    expect(envelopes[0]?.next.meal_period_id).toBeNull()
    expect(envelopes[1]).toMatchObject({
      entityType: 'meal_periods',
      entityId: periodId,
      operation: 'soft_delete',
    })
    expect(typeof envelopes[1]?.next.deleted_at).toBe('string')
  })

  it('soft deletes an unused period without inventing planner mutations', async () => {
    const envelopes: MutationEnvelope[] = []
    const repository = new PlannerRepository(databaseFixture([]), scope, writerInto(envelopes))

    await repository.softDeleteMealPeriod(periodId)

    expect(envelopes).toHaveLength(1)
    expect(envelopes[0]).toMatchObject({ entityType: 'meal_periods', entityId: periodId, operation: 'soft_delete' })
  })
})
