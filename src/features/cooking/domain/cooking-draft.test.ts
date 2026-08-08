import { describe, expect, it } from 'vitest'
import type { RecipeAggregate } from '../../recipes/data/recipe-repository'
import { createCookingDraft } from './cooking-draft'

const recipe: RecipeAggregate = {
  id: '40000000-0000-4000-8000-000000000004',
  revision: 4,
  title: 'Bolo simples',
  description: null,
  favorite: false,
  wantToMake: true,
  baseYield: { numerator: 4, denominator: 1 },
  baseYieldUnit: 'porções',
  prepTimeSeconds: 600,
  cookTimeSeconds: 1200,
  totalTimeSeconds: 1800,
  updatedAt: '2026-08-07T20:00:00.000Z',
  ingredients: [],
  steps: [
    {
      id: '60000000-0000-4000-8000-000000000006',
      recipeId: '40000000-0000-4000-8000-000000000004',
      position: 0,
      instruction: 'Misture.',
      durationSeconds: 120,
      note: null,
    },
  ],
}

describe('cooking draft', () => {
  it('starts from an immutable recipe snapshot with a stable finalization id', () => {
    const draft = createCookingDraft(recipe, {
      id: 'draft-a',
      finalizationSessionId: 'session-a',
      startedAt: '2026-08-07T20:00:00.000Z',
    })

    recipe.title = 'Editada depois'
    recipe.steps[0]!.instruction = 'Outra instrução.'

    expect(draft.id).toBe('draft-a')
    expect(draft.finalizationSessionId).toBe('session-a')
    expect(draft.recipeSnapshot.title).toBe('Bolo simples')
    expect(draft.recipeSnapshot.steps[0]?.instruction).toBe('Misture.')
    expect(draft.currentStepIndex).toBe(0)
    expect(draft.servingMultiplier).toEqual({ numerator: 1, denominator: 1 })
    expect(draft.timers).toEqual([])
  })

  it('rejects a current step outside the snapshot bounds when restoring state', () => {
    expect(() => createCookingDraft(recipe, { currentStepIndex: 2 })).toThrow('current step')
  })
})
