import type { PowerSyncDatabase } from '@powersync/web'
import { createMutationEnvelope, type JsonObject, type MutationEnvelope } from '../../../data/mutations/types'
import { performLocalMutation } from '../../../data/mutations/performLocalMutation'
import { resolveMutationBase } from '../../../data/mutations/resolveMutationBase'
import type {
  MealPeriod,
  MealPlanEntry,
  MealPlanEntryInput,
  MealPlanRange,
  PlannerRepositoryScope,
} from '../domain/types'

interface DatabaseRow extends Record<string, unknown> { id: string }
type MutationWriter = (database: PowerSyncDatabase, envelope: MutationEnvelope) => Promise<string>

function payloadFromRow(row: DatabaseRow): JsonObject {
  const payload: JsonObject = {}
  for (const [key, value] of Object.entries(row)) {
    if (key === 'id' || value === undefined) continue
    payload[key] = value as JsonObject[string]
  }
  return payload
}

function requiredName(rawName: string): string {
  const name = rawName.trim()
  if (!name) throw new Error('Meal period name is required')
  if (name.length > 80) throw new Error('Meal period name must be at most 80 characters')
  return name
}

function dateOnly(value: string, label = 'Planner date'): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new Error(`${label} must use YYYY-MM-DD`)

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const candidate = new Date(Date.UTC(year, month - 1, day))
  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1
    || candidate.getUTCDate() !== day
  ) {
    throw new Error(`${label} is invalid`)
  }
  return value
}

function localTime(value: string | null): string | null {
  if (value === null) return null
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (!match) throw new Error('Planner time must use HH:MM or HH:MM:SS')
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = match[3] === undefined ? 0 : Number(match[3])
  if (hours > 23 || minutes > 59 || seconds > 59) throw new Error('Planner time is invalid')
  return match[3] === undefined ? `${match[1]}:${match[2]}` : `${match[1]}:${match[2]}:${match[3]}`
}

function normalizeNote(value: string | null): string | null {
  if (value === null) return null
  const note = value.trim()
  return note || null
}

function servingsColumns(servings: MealPlanEntryInput['servings']) {
  if (servings === null) return { servings_numerator: null, servings_denominator: null }
  if (!Number.isSafeInteger(servings.numerator) || !Number.isSafeInteger(servings.denominator)) {
    throw new Error('Planner servings must use safe integer rational values')
  }
  if (servings.numerator <= 0 || servings.denominator <= 0) {
    throw new Error('Planner servings must be greater than zero')
  }
  return {
    servings_numerator: servings.numerator,
    servings_denominator: servings.denominator,
  }
}

function mapMealPeriod(row: DatabaseRow): MealPeriod {
  return {
    id: row.id,
    pairId: String(row.pair_id),
    name: String(row.name),
    position: Number(row.position),
    revision: Number(row.revision),
    deletedAt: typeof row.deleted_at === 'string' ? row.deleted_at : null,
  }
}

function mapMealPlanEntry(row: DatabaseRow): MealPlanEntry {
  const numerator = typeof row.servings_numerator === 'number' ? row.servings_numerator : null
  const denominator = typeof row.servings_denominator === 'number' ? row.servings_denominator : null
  return {
    id: row.id,
    pairId: String(row.pair_id),
    recipeId: String(row.recipe_id),
    date: String(row.planned_date),
    mealPeriodId: typeof row.meal_period_id === 'string' ? row.meal_period_id : null,
    time: typeof row.planned_time === 'string' ? row.planned_time : null,
    servings: numerator !== null && denominator !== null ? { numerator, denominator } : null,
    note: typeof row.note === 'string' ? row.note : null,
    revision: Number(row.revision),
    deletedAt: typeof row.deleted_at === 'string' ? row.deleted_at : null,
  }
}

export class PlannerRepository {
  constructor(
    private readonly database: PowerSyncDatabase,
    private readonly scope: PlannerRepositoryScope,
    private readonly writeMutation: MutationWriter = performLocalMutation,
  ) {}

  async listMealPeriods(): Promise<MealPeriod[]> {
    const rows = await this.database.getAll<DatabaseRow>(
      'SELECT * FROM meal_periods WHERE pair_id = ? AND deleted_at IS NULL ORDER BY position ASC, name COLLATE NOCASE ASC',
      [this.scope.pairId],
    )
    return rows.map(mapMealPeriod)
  }

  async createMealPeriod(rawName: string): Promise<string> {
    const name = requiredName(rawName)
    const existing = await this.database.getOptional<{ id: string }>(
      'SELECT id FROM meal_periods WHERE pair_id = ? AND deleted_at IS NULL AND lower(trim(name)) = lower(trim(?)) LIMIT 1',
      [this.scope.pairId, name],
    )
    if (existing) throw new Error('An active meal period with this name already exists')

    const positionRow = await this.database.getOptional<{ max_position: number | null }>(
      'SELECT MAX(position) AS max_position FROM meal_periods WHERE pair_id = ? AND deleted_at IS NULL',
      [this.scope.pairId],
    )
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    await this.writeMutation(this.database, createMutationEnvelope({
      pairId: this.scope.pairId,
      actorUserId: this.scope.actorUserId,
      entityType: 'meal_periods',
      entityId: id,
      operation: 'create',
      baseRevision: null,
      base: null,
      next: {
        pair_id: this.scope.pairId,
        revision: 0,
        name,
        position: (positionRow?.max_position ?? -1) + 1,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
    }))
    return id
  }

  async renameMealPeriod(id: string, rawName: string): Promise<void> {
    const name = requiredName(rawName)
    const duplicate = await this.database.getOptional<{ id: string }>(
      'SELECT id FROM meal_periods WHERE pair_id = ? AND id <> ? AND deleted_at IS NULL AND lower(trim(name)) = lower(trim(?)) LIMIT 1',
      [this.scope.pairId, id, name],
    )
    if (duplicate) throw new Error('An active meal period with this name already exists')

    const row = await this.activeRow('meal_periods', id)
    const current = payloadFromRow(row)
    const base = await resolveMutationBase(this.database, 'meal_periods', id, current)
    await this.writeMutation(this.database, createMutationEnvelope({
      pairId: this.scope.pairId,
      actorUserId: this.scope.actorUserId,
      entityType: 'meal_periods',
      entityId: id,
      operation: 'update',
      ...base,
      next: { ...current, name, updated_at: new Date().toISOString() },
    }))
  }

  async reorderMealPeriods(ids: readonly string[]): Promise<void> {
    if (new Set(ids).size !== ids.length) throw new Error('Meal period order contains duplicate ids')
    const rows = await this.database.getAll<DatabaseRow>(
      'SELECT * FROM meal_periods WHERE pair_id = ? AND deleted_at IS NULL ORDER BY position ASC, id ASC',
      [this.scope.pairId],
    )
    const byId = new Map(rows.map((row) => [row.id, row]))
    if (rows.length !== ids.length || ids.some((id) => !byId.has(id))) {
      throw new Error('Meal period order must include every active period exactly once')
    }

    const now = new Date().toISOString()
    for (const [position, id] of ids.entries()) {
      const row = byId.get(id)
      if (!row || Number(row.position) === position) continue
      const current = payloadFromRow(row)
      const base = await resolveMutationBase(this.database, 'meal_periods', id, current)
      await this.writeMutation(this.database, createMutationEnvelope({
        pairId: this.scope.pairId,
        actorUserId: this.scope.actorUserId,
        entityType: 'meal_periods',
        entityId: id,
        operation: 'update',
        ...base,
        next: { ...current, position, updated_at: now },
      }))
    }
  }

  async listEntries(range: MealPlanRange): Promise<MealPlanEntry[]> {
    const start = dateOnly(range.start, 'Planner range start')
    const end = dateOnly(range.end, 'Planner range end')
    if (start > end) throw new Error('Planner range start must not be after end')

    const rows = await this.database.getAll<DatabaseRow>(
      `SELECT * FROM meal_plan_entries
       WHERE pair_id = ? AND deleted_at IS NULL AND planned_date >= ? AND planned_date <= ?
       ORDER BY planned_date ASC, planned_time IS NULL ASC, planned_time ASC, created_at ASC`,
      [this.scope.pairId, start, end],
    )
    return rows.map(mapMealPlanEntry)
  }

  async upsertEntry(input: MealPlanEntryInput & { id?: string }): Promise<string> {
    const normalized = this.normalizeEntryInput(input)
    const id = input.id ?? crypto.randomUUID()
    const row = input.id ? await this.activeRow('meal_plan_entries', input.id) : null
    const now = new Date().toISOString()

    if (!row) {
      await this.writeMutation(this.database, createMutationEnvelope({
        pairId: this.scope.pairId,
        actorUserId: this.scope.actorUserId,
        entityType: 'meal_plan_entries',
        entityId: id,
        operation: 'create',
        baseRevision: null,
        base: null,
        next: {
          pair_id: this.scope.pairId,
          revision: 0,
          recipe_id: normalized.recipeId,
          meal_period_id: normalized.mealPeriodId,
          planned_date: normalized.date,
          planned_time: normalized.time,
          ...servingsColumns(normalized.servings),
          note: normalized.note,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
      }))
      return id
    }

    const current = payloadFromRow(row)
    const base = await resolveMutationBase(this.database, 'meal_plan_entries', id, current)
    await this.writeMutation(this.database, createMutationEnvelope({
      pairId: this.scope.pairId,
      actorUserId: this.scope.actorUserId,
      entityType: 'meal_plan_entries',
      entityId: id,
      operation: 'update',
      ...base,
      next: {
        ...current,
        recipe_id: normalized.recipeId,
        meal_period_id: normalized.mealPeriodId,
        planned_date: normalized.date,
        planned_time: normalized.time,
        ...servingsColumns(normalized.servings),
        note: normalized.note,
        updated_at: now,
      },
    }))
    return id
  }

  async softDeleteEntry(id: string): Promise<void> {
    const row = await this.activeRow('meal_plan_entries', id)
    const current = payloadFromRow(row)
    const base = await resolveMutationBase(this.database, 'meal_plan_entries', id, current)
    const now = new Date().toISOString()
    await this.writeMutation(this.database, createMutationEnvelope({
      pairId: this.scope.pairId,
      actorUserId: this.scope.actorUserId,
      entityType: 'meal_plan_entries',
      entityId: id,
      operation: 'soft_delete',
      ...base,
      next: { ...current, deleted_at: now, updated_at: now },
    }))
  }

  private normalizeEntryInput(input: MealPlanEntryInput): MealPlanEntryInput {
    if (!input.recipeId) throw new Error('Planner recipe is required')
    if (!input.mealPeriodId) throw new Error('Planner meal period is required')
    servingsColumns(input.servings)
    return {
      recipeId: input.recipeId,
      date: dateOnly(input.date),
      mealPeriodId: input.mealPeriodId,
      time: localTime(input.time),
      servings: input.servings,
      note: normalizeNote(input.note),
    }
  }

  private async activeRow(entityType: 'meal_periods' | 'meal_plan_entries', id: string): Promise<DatabaseRow> {
    const row = await this.database.getOptional<DatabaseRow>(
      `SELECT * FROM ${entityType} WHERE id = ? AND pair_id = ? AND deleted_at IS NULL LIMIT 1`,
      [id, this.scope.pairId],
    )
    if (!row) throw new Error(entityType === 'meal_periods' ? 'Meal period not found' : 'Meal plan entry not found')
    return row
  }
}
