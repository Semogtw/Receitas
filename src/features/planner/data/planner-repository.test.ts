import type { PowerSyncDatabase } from '@powersync/web'
import { describe, expect, it, vi } from 'vitest'
import type { MutationEnvelope } from '../../../data/mutations/types'
import { PlannerRepository } from './planner-repository'

const scope = {
  pairId: '20000000-0000-4000-8000-000000000002',
  actorUserId: '10000000-0000-4000-8000-000000000001',
}
const recipeId = '40000000-0000-4000-8000-000000000004'
const periodId = '50000000-0000-4000-8000-000000000005'
const secondPeriodId = '50000000-0000-4000-8000-000000000006'
const entryId = '60000000-0000-4000-8000-000000000006'

function writerInto(envelopes: MutationEnvelope[]) {
  return vi.fn(async (_database: PowerSyncDatabase, envelope: MutationEnvelope) => {
    envelopes.push(envelope)
    return envelope.mutationId
  })
}

function databaseWith(options: {
  activePeriod?: Record<string, unknown> | null
  activeEntry?: Record<string, unknown> | null
  periods?: Record<string, unknown>[]
  entries?: Record<string, unknown>[]
  maxPosition?: number | null
} = {}) {
  return {
    getOptional: vi.fn(async (sql: string) => {
      if (sql.includes('mutation_outbox')) return null
      if (sql.includes('MAX(position)')) return { max_position: options.maxPosition ?? null }
      if (sql.includes('lower(trim(name))')) return null
      if (sql.includes('meal_plan_entries')) return options.activeEntry ?? null
      if (sql.includes('meal_periods')) return options.activePeriod ?? null
      return null
    }),
    getAll: vi.fn(async (sql: string) => {
      if (sql.includes('meal_periods')) return options.periods ?? []
      if (sql.includes('meal_plan_entries')) return options.entries ?? []
      return []
    }),
  } as unknown as PowerSyncDatabase
}

function activePeriod(id = periodId, position = 0) {
  return {
    id,
    pair_id: scope.pairId,
    name: position === 0 ? 'Almoço' : 'Jantar',
    position,
    revision: 2,
    created_at: '2026-08-08T12:00:00.000Z',
    updated_at: '2026-08-08T12:00:00.000Z',
    deleted_at: null,
  }
}

function plannerEntry(mealPeriodId: string | null = periodId) {
  return {
    id: entryId,
    pair_id: scope.pairId,
    recipe_id: recipeId,
    meal_period_id: mealPeriodId,
    planned_date: '2026-08-10',
    planned_time: '19:30',
    servings_numerator: 3,
    servings_denominator: 2,
    note: 'Fazer molho antes',
    revision: 4,
    created_at: '2026-08-08T12:00:00.000Z',
    updated_at: '2026-08-08T12:00:00.000Z',
    deleted_at: null,
  }
}

describe('PlannerRepository', () => {
  it('creates a custom meal period at the next stable position', async () => {
    const envelopes: MutationEnvelope[] = []
    const repository = new PlannerRepository(databaseWith({ maxPosition: 2 }), scope, writerInto(envelopes))

    const id = await repository.createMealPeriod('  Ceia  ')

    expect(id).toBeTruthy()
    expect(envelopes).toHaveLength(1)
    expect(envelopes[0]).toMatchObject({ entityType: 'meal_periods', entityId: id, operation: 'create' })
    expect(envelopes[0]?.next).toMatchObject({ name: 'Ceia', position: 3, pair_id: scope.pairId })
  })

  it('renames and reorders meal periods through versioned semantic updates', async () => {
    const envelopes: MutationEnvelope[] = []
    const first = activePeriod(periodId, 0)
    const second = activePeriod(secondPeriodId, 1)
    const database = databaseWith({ activePeriod: first, periods: [first, second] })
    const repository = new PlannerRepository(database, scope, writerInto(envelopes))

    await repository.renameMealPeriod(periodId, 'Almoço tardio')
    await repository.reorderMealPeriods([secondPeriodId, periodId])

    expect(envelopes[0]).toMatchObject({
      entityType: 'meal_periods',
      entityId: periodId,
      operation: 'update',
      baseRevision: 2,
    })
    expect(envelopes[0]?.next.name).toBe('Almoço tardio')
    expect(envelopes.slice(1).map((envelope) => [envelope.entityId, envelope.next.position])).toEqual([
      [secondPeriodId, 0],
      [periodId, 1],
    ])
  })

  it('persists planner date and local time without timezone conversion', async () => {
    const envelopes: MutationEnvelope[] = []
    const repository = new PlannerRepository(databaseWith(), scope, writerInto(envelopes))

    const id = await repository.upsertEntry({
      recipeId,
      date: '2026-08-10',
      mealPeriodId: periodId,
      time: '00:15',
      servings: { numerator: 3, denominator: 2 },
      note: '  Depois da academia  ',
    })

    expect(envelopes[0]).toMatchObject({ entityType: 'meal_plan_entries', entityId: id, operation: 'create' })
    expect(envelopes[0]?.next).toMatchObject({
      planned_date: '2026-08-10',
      planned_time: '00:15',
      servings_numerator: 3,
      servings_denominator: 2,
      note: 'Depois da academia',
    })
  })

  it('updates an existing active entry in place and can clear optional fields', async () => {
    const envelopes: MutationEnvelope[] = []
    const repository = new PlannerRepository(databaseWith({ activeEntry: plannerEntry() }), scope, writerInto(envelopes))

    const id = await repository.upsertEntry({
      id: entryId,
      recipeId,
      date: '2026-08-11',
      mealPeriodId: periodId,
      time: null,
      servings: null,
      note: null,
    })

    expect(id).toBe(entryId)
    expect(envelopes[0]).toMatchObject({
      entityType: 'meal_plan_entries',
      entityId: entryId,
      operation: 'update',
      baseRevision: 4,
    })
    expect(envelopes[0]?.next).toMatchObject({
      planned_date: '2026-08-11',
      planned_time: null,
      servings_numerator: null,
      servings_denominator: null,
      note: null,
      deleted_at: null,
    })
  })

  it('does not reinterpret an edit of a missing or deleted entry as a create/restore', async () => {
    const envelopes: MutationEnvelope[] = []
    const repository = new PlannerRepository(databaseWith({ activeEntry: null }), scope, writerInto(envelopes))

    await expect(repository.upsertEntry({
      id: entryId,
      recipeId,
      date: '2026-08-11',
      mealPeriodId: periodId,
      time: null,
      servings: null,
      note: null,
    })).rejects.toThrow('Meal plan entry not found')
    expect(envelopes).toHaveLength(0)
  })

  it('soft deletes an entry with the operation required by the server sync contract', async () => {
    const envelopes: MutationEnvelope[] = []
    const repository = new PlannerRepository(databaseWith({ activeEntry: plannerEntry() }), scope, writerInto(envelopes))

    await repository.softDeleteEntry(entryId)

    expect(envelopes).toHaveLength(1)
    expect(envelopes[0]).toMatchObject({ entityId: entryId, operation: 'soft_delete' })
    expect(typeof envelopes[0]?.next.deleted_at).toBe('string')
  })

  it('lists only the requested inclusive date range and maps rational servings', async () => {
    const row = plannerEntry()
    const database = databaseWith({ entries: [row] })
    const repository = new PlannerRepository(database, scope)

    const result = await repository.listEntries({ start: '2026-08-10', end: '2026-08-12' })

    expect(result).toEqual([{
      id: entryId,
      pairId: scope.pairId,
      recipeId,
      date: '2026-08-10',
      mealPeriodId: periodId,
      time: '19:30',
      servings: { numerator: 3, denominator: 2 },
      note: 'Fazer molho antes',
      revision: 4,
      deletedAt: null,
    }])
    expect(vi.mocked(database.getAll).mock.calls[0]?.[1]).toEqual([scope.pairId, '2026-08-10', '2026-08-12'])
  })

  it('preserves a legacy null meal period instead of coercing it to the string "null"', async () => {
    const database = databaseWith({ entries: [plannerEntry(null)] })
    const repository = new PlannerRepository(database, scope)

    const [result] = await repository.listEntries({ start: '2026-08-10', end: '2026-08-10' })

    expect(result?.mealPeriodId).toBeNull()
  })

  it('rejects invalid date/time input before enqueueing a mutation', async () => {
    const envelopes: MutationEnvelope[] = []
    const repository = new PlannerRepository(databaseWith(), scope, writerInto(envelopes))

    await expect(repository.upsertEntry({
      recipeId,
      date: '2026-02-30',
      mealPeriodId: periodId,
      time: '24:00',
      servings: null,
      note: null,
    })).rejects.toThrow('Planner date is invalid')
    expect(envelopes).toHaveLength(0)
  })

  it('requires a reorder payload to contain each active period exactly once', async () => {
    const first = activePeriod(periodId, 0)
    const second = activePeriod(secondPeriodId, 1)
    const repository = new PlannerRepository(databaseWith({ periods: [first, second] }), scope, vi.fn())

    await expect(repository.reorderMealPeriods([periodId])).rejects.toThrow(
      'Meal period order must include every active period exactly once',
    )
  })
})
