import { describe, expect, it } from 'vitest'
import type { RecipeAggregate } from '../../recipes/data/recipe-repository'
import {
  averageRating,
  assertValidCookingScore,
  createRecipeSnapshot,
  type CookingSessionRating,
} from './cooking-session'

const recipe: RecipeAggregate = {
  id: '40000000-0000-4000-8000-000000000004',
  revision: 7,
  title: 'Bolo simples',
  description: 'Receita original',
  favorite: true,
  wantToMake: false,
  baseYield: { numerator: 4, denominator: 1 },
  baseYieldUnit: 'porções',
  prepTimeSeconds: 600,
  cookTimeSeconds: 1800,
  totalTimeSeconds: 2400,
  updatedAt: '2026-08-07T21:00:00.000Z',
  ingredients: [
    {
      id: '50000000-0000-4000-8000-000000000005',
      recipeId: '40000000-0000-4000-8000-000000000004',
      position: 0,
      amount: { kind: 'numeric', value: { numerator: 3, denominator: 2 } },
      unit: 'xícara',
      name: 'Farinha',
      normalizedName: 'farinha',
      note: null,
      isApproximate: false,
      isOptional: false,
    },
  ],
  steps: [
    {
      id: '60000000-0000-4000-8000-000000000006',
      recipeId: '40000000-0000-4000-8000-000000000004',
      position: 0,
      instruction: 'Misture tudo.',
      durationSeconds: 120,
      note: null,
    },
  ],
}

describe('cooking session domain', () => {
  it('accepts scores from 0 to 10 only in half-point increments', () => {
    expect(() => assertValidCookingScore(0)).not.toThrow()
    expect(() => assertValidCookingScore(0.5)).not.toThrow()
    expect(() => assertValidCookingScore(7.5)).not.toThrow()
    expect(() => assertValidCookingScore(10)).not.toThrow()

    expect(() => assertValidCookingScore(-0.5)).toThrow('between 0 and 10')
    expect(() => assertValidCookingScore(10.5)).toThrow('between 0 and 10')
    expect(() => assertValidCookingScore(7.25)).toThrow('0.5 increments')
    expect(() => assertValidCookingScore(Number.NaN)).toThrow('finite')
  })

  it('excludes missing ratings from averages instead of treating them as zero', () => {
    const ratings: CookingSessionRating[] = [
      {
        id: 'rating-a',
        sessionId: 'session-a',
        userId: 'user-a',
        score: 8,
        comment: 'Gostei.',
        updatedAt: '2026-08-07T21:00:00.000Z',
      },
    ]

    expect(averageRating(ratings)).toBe(8)
    expect(averageRating([])).toBeNull()
  })

  it('keeps personal rating comments separate from the shared session observation', () => {
    const rating: CookingSessionRating = {
      id: 'rating-a',
      sessionId: 'session-a',
      userId: 'user-a',
      score: 9,
      comment: 'Eu colocaria mais canela.',
      updatedAt: '2026-08-07T21:00:00.000Z',
    }
    const sharedObservation = 'Da próxima vez, assar por cinco minutos a menos.'

    expect(rating.comment).not.toBe(sharedObservation)
    expect(rating).not.toHaveProperty('sharedObservation')
  })

  it('creates a detached recipe snapshot that is not changed by later recipe edits', () => {
    const snapshot = createRecipeSnapshot(recipe)

    recipe.title = 'Título editado depois'
    recipe.ingredients[0]!.name = 'Outra farinha'
    recipe.steps[0]!.instruction = 'Outra instrução.'

    expect(snapshot.title).toBe('Bolo simples')
    expect(snapshot.recipeRevision).toBe(7)
    expect(snapshot.ingredients[0]?.name).toBe('Farinha')
    expect(snapshot.steps[0]?.instruction).toBe('Misture tudo.')
  })
})
