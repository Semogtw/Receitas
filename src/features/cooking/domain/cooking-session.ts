import type { RecipeAggregate } from '../../recipes/data/recipe-repository'
import type { IngredientAmount, Rational } from '../../recipes/domain/types'

export interface CookingSnapshotIngredient {
  id: string
  position: number
  amount: IngredientAmount
  unit: string | null
  name: string
  normalizedName: string
  note: string | null
  isApproximate: boolean
  isOptional: boolean
}

export interface CookingSnapshotStep {
  id: string
  position: number
  instruction: string
  durationSeconds: number | null
  note: string | null
}

export interface CookingRecipeSnapshot {
  version: 1
  recipeId: string
  recipeRevision: number
  title: string
  description: string | null
  baseYield: Rational | null
  baseYieldUnit: string | null
  prepTimeSeconds: number | null
  cookTimeSeconds: number | null
  totalTimeSeconds: number | null
  ingredients: CookingSnapshotIngredient[]
  steps: CookingSnapshotStep[]
}

export interface CookingSessionRating {
  id: string
  sessionId: string
  userId: string
  score: number
  comment: string | null
  updatedAt: string
}

export interface CookingSessionSummary {
  id: string
  recipeId: string
  recordedBy: string
  startedAt: string | null
  preparedAt: string
  preparedYield: Rational | null
  sharedObservation: string | null
  snapshot: CookingRecipeSnapshot
  ratings: CookingSessionRating[]
  averageScore: number | null
}

function cloneAmount(amount: IngredientAmount): IngredientAmount {
  if (amount.kind === 'numeric') {
    return {
      kind: 'numeric',
      value: {
        numerator: amount.value.numerator,
        denominator: amount.value.denominator,
      },
    }
  }
  if (amount.kind === 'text') return { kind: 'text', text: amount.text }
  return { kind: 'none' }
}

function cloneRational(value: Rational | null): Rational | null {
  return value ? { numerator: value.numerator, denominator: value.denominator } : null
}

export function createRecipeSnapshot(recipe: RecipeAggregate): CookingRecipeSnapshot {
  return {
    version: 1,
    recipeId: recipe.id,
    recipeRevision: recipe.revision,
    title: recipe.title,
    description: recipe.description,
    baseYield: cloneRational(recipe.baseYield),
    baseYieldUnit: recipe.baseYieldUnit,
    prepTimeSeconds: recipe.prepTimeSeconds,
    cookTimeSeconds: recipe.cookTimeSeconds,
    totalTimeSeconds: recipe.totalTimeSeconds,
    ingredients: recipe.ingredients.map((ingredient) => ({
      id: ingredient.id,
      position: ingredient.position,
      amount: cloneAmount(ingredient.amount),
      unit: ingredient.unit,
      name: ingredient.name,
      normalizedName: ingredient.normalizedName,
      note: ingredient.note,
      isApproximate: ingredient.isApproximate,
      isOptional: ingredient.isOptional,
    })),
    steps: recipe.steps.map((step) => ({
      id: step.id,
      position: step.position,
      instruction: step.instruction,
      durationSeconds: step.durationSeconds,
      note: step.note,
    })),
  }
}

export function assertValidCookingScore(score: number): void {
  if (!Number.isFinite(score)) throw new Error('Cooking score must be finite')
  if (score < 0 || score > 10) throw new Error('Cooking score must be between 0 and 10')
  if (!Number.isInteger(score * 2)) throw new Error('Cooking score must use 0.5 increments')
}

export function averageRating(ratings: readonly CookingSessionRating[]): number | null {
  if (ratings.length === 0) return null

  let total = 0
  for (const rating of ratings) {
    assertValidCookingScore(rating.score)
    total += rating.score
  }
  return total / ratings.length
}
