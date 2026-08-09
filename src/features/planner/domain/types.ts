import type { Rational } from '../../recipes/domain/types'

export interface MealPeriod {
  id: string
  pairId: string
  name: string
  position: number
  revision: number
  deletedAt: string | null
}

export interface MealPlanEntryInput {
  recipeId: string
  date: string
  mealPeriodId: string
  time: string | null
  servings: Rational | null
  note: string | null
}

export interface MealPlanEntry extends MealPlanEntryInput {
  id: string
  pairId: string
  revision: number
  deletedAt: string | null
}

export interface PlannerRepositoryScope {
  pairId: string
  actorUserId: string
}

export interface MealPlanRange {
  start: string
  end: string
}
