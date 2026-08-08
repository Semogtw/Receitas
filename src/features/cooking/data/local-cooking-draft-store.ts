import type { PowerSyncDatabase } from '@powersync/web'
import { normalizeRational } from '../../recipes/domain/amount'
import type { CookingDraft } from '../domain/cooking-draft'
import type { CookingRecipeSnapshot } from '../domain/cooking-session'
import type { CookingTimer } from '../domain/timers'

const ACTIVE_DRAFT_KEY = 'active_cooking_draft'

interface PreferenceRow {
  value_json: string
}

function parseSnapshot(value: unknown): CookingRecipeSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Persisted cooking draft snapshot is invalid')
  }
  const snapshot = value as Partial<CookingRecipeSnapshot>
  if (
    snapshot.version !== 1 ||
    typeof snapshot.recipeId !== 'string' ||
    typeof snapshot.recipeRevision !== 'number' ||
    typeof snapshot.title !== 'string' ||
    !Array.isArray(snapshot.ingredients) ||
    !Array.isArray(snapshot.steps)
  ) {
    throw new Error('Persisted cooking draft snapshot is malformed')
  }
  return snapshot as CookingRecipeSnapshot
}

function parseTimer(value: unknown): CookingTimer {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Persisted cooking draft timer is invalid')
  }
  const timer = value as Partial<CookingTimer>
  if (
    typeof timer.id !== 'string' ||
    typeof timer.label !== 'string' ||
    !Number.isSafeInteger(timer.durationSeconds) ||
    Number(timer.durationSeconds) <= 0 ||
    !(timer.targetAt === null || typeof timer.targetAt === 'string') ||
    !(timer.pausedRemainingSeconds === null || Number.isSafeInteger(timer.pausedRemainingSeconds))
  ) {
    throw new Error('Persisted cooking draft timer is malformed')
  }
  return timer as CookingTimer
}

function parseDraft(value: string): CookingDraft {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('Persisted cooking draft is not valid JSON')
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Persisted cooking draft is invalid')
  }

  const draft = parsed as Partial<CookingDraft>
  if (
    draft.version !== 1 ||
    typeof draft.id !== 'string' ||
    typeof draft.finalizationSessionId !== 'string' ||
    typeof draft.startedAt !== 'string' ||
    !Number.isSafeInteger(draft.currentStepIndex) ||
    !Array.isArray(draft.timers) ||
    !draft.servingMultiplier
  ) {
    throw new Error('Persisted cooking draft is malformed')
  }

  const snapshot = parseSnapshot(draft.recipeSnapshot)
  const stepIndex = Number(draft.currentStepIndex)
  if (stepIndex < 0 || (snapshot.steps.length > 0 && stepIndex >= snapshot.steps.length) || (snapshot.steps.length === 0 && stepIndex !== 0)) {
    throw new Error('Persisted cooking draft current step is invalid')
  }

  const servingMultiplier = normalizeRational(draft.servingMultiplier)
  if (servingMultiplier.numerator <= 0) {
    throw new Error('Persisted cooking draft serving multiplier is invalid')
  }

  return {
    version: 1,
    id: draft.id,
    finalizationSessionId: draft.finalizationSessionId,
    recipeSnapshot: snapshot,
    startedAt: draft.startedAt,
    currentStepIndex: stepIndex,
    servingMultiplier,
    timers: draft.timers.map(parseTimer),
  }
}

export class LocalCookingDraftStore {
  constructor(private readonly database: PowerSyncDatabase) {}

  async load(): Promise<CookingDraft | null> {
    const row = await this.database.getOptional<PreferenceRow>(
      `SELECT value_json FROM device_preferences WHERE id = '${ACTIVE_DRAFT_KEY}' LIMIT 1`,
    )
    if (!row) return null
    return parseDraft(row.value_json)
  }

  async save(draft: CookingDraft): Promise<void> {
    const value = JSON.stringify(draft)
    const now = new Date().toISOString()
    await this.database.execute(
      `INSERT INTO device_preferences (id, value_json, updated_at)
       VALUES ('${ACTIVE_DRAFT_KEY}', ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         value_json = excluded.value_json,
         updated_at = excluded.updated_at`,
      [value, now],
    )
  }

  async clear(): Promise<void> {
    await this.database.execute(
      `DELETE FROM device_preferences WHERE id = '${ACTIVE_DRAFT_KEY}'`,
      [],
    )
  }
}
