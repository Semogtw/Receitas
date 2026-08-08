import type { RecipeAggregate } from '../../recipes/data/recipe-repository'
import { normalizeRational } from '../../recipes/domain/amount'
import type { Rational } from '../../recipes/domain/types'
import { createRecipeSnapshot, type CookingRecipeSnapshot } from './cooking-session'
import type { CookingTimer } from './timers'

export interface CookingDraft {
  version: 1
  id: string
  finalizationSessionId: string
  recipeSnapshot: CookingRecipeSnapshot
  startedAt: string
  currentStepIndex: number
  servingMultiplier: Rational
  timers: CookingTimer[]
}

export interface CreateCookingDraftOptions {
  id?: string
  finalizationSessionId?: string
  startedAt?: string
  currentStepIndex?: number
  servingMultiplier?: Rational
  timers?: readonly CookingTimer[]
}

function validateStepIndex(stepIndex: number, stepCount: number): number {
  if (!Number.isSafeInteger(stepIndex) || stepIndex < 0) {
    throw new Error('Cooking draft current step must be a non-negative integer')
  }
  if (stepCount > 0 && stepIndex >= stepCount) {
    throw new Error('Cooking draft current step is outside the recipe snapshot')
  }
  if (stepCount === 0 && stepIndex !== 0) {
    throw new Error('Cooking draft current step must be zero when the recipe has no steps')
  }
  return stepIndex
}

function cloneTimers(timers: readonly CookingTimer[]): CookingTimer[] {
  return timers.map((timer) => ({ ...timer }))
}

export function createCookingDraft(
  recipe: RecipeAggregate,
  options: CreateCookingDraftOptions = {},
): CookingDraft {
  const recipeSnapshot = createRecipeSnapshot(recipe)
  const multiplier = normalizeRational(options.servingMultiplier ?? { numerator: 1, denominator: 1 })
  if (multiplier.numerator <= 0) throw new Error('Cooking draft serving multiplier must be greater than zero')

  return {
    version: 1,
    id: options.id ?? crypto.randomUUID(),
    finalizationSessionId: options.finalizationSessionId ?? crypto.randomUUID(),
    recipeSnapshot,
    startedAt: options.startedAt ?? new Date().toISOString(),
    currentStepIndex: validateStepIndex(options.currentStepIndex ?? 0, recipeSnapshot.steps.length),
    servingMultiplier: multiplier,
    timers: cloneTimers(options.timers ?? []),
  }
}
