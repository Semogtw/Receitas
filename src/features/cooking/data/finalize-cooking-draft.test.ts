import { describe, expect, it, vi } from 'vitest'
import type { CookingDraft } from '../domain/cooking-draft'
import { finalizeCookingDraft } from './finalize-cooking-draft'

const draft: CookingDraft = {
  version: 1,
  id: 'draft-a',
  finalizationSessionId: 'session-a',
  recipeSnapshot: {
    version: 1,
    recipeId: 'recipe-a',
    recipeRevision: 5,
    title: 'Bolo original',
    description: null,
    baseYield: { numerator: 4, denominator: 1 },
    baseYieldUnit: 'porções',
    prepTimeSeconds: 600,
    cookTimeSeconds: 1200,
    totalTimeSeconds: 1800,
    ingredients: [
      {
        id: 'ingredient-a', position: 0,
        amount: { kind: 'numeric', value: { numerator: 1, denominator: 1 } },
        unit: 'xícara', name: 'Farinha', normalizedName: 'farinha', note: null,
        isApproximate: false, isOptional: false,
      },
    ],
    steps: [
      { id: 'step-a', position: 0, instruction: 'Misture.', durationSeconds: 120, note: null },
    ],
  },
  startedAt: '2026-08-07T20:00:00.000Z',
  currentStepIndex: 0,
  servingMultiplier: { numerator: 3, denominator: 2 },
  timers: [],
}

describe('finalizeCookingDraft', () => {
  it('uses the stable finalization session id and the recipe snapshot captured at cooking start', async () => {
    const createCookingSession = vi.fn(async () => draft.finalizationSessionId)
    const clear = vi.fn(async () => undefined)

    const id = await finalizeCookingDraft(
      draft,
      { createCookingSession },
      { clear },
      { preparedYield: { numerator: 6, denominator: 1 }, sharedObservation: 'Ficou ótimo.' },
    )

    expect(id).toBe('session-a')
    expect(createCookingSession).toHaveBeenCalledWith(expect.objectContaining({
      id: 'session-a',
      startedAt: '2026-08-07T20:00:00.000Z',
      preparedYield: { numerator: 6, denominator: 1 },
      sharedObservation: 'Ficou ótimo.',
      recipe: expect.objectContaining({
        id: 'recipe-a',
        revision: 5,
        title: 'Bolo original',
        ingredients: [expect.objectContaining({ id: 'ingredient-a', name: 'Farinha' })],
        steps: [expect.objectContaining({ id: 'step-a', instruction: 'Misture.' })],
      }),
    }))
    expect(clear).toHaveBeenCalledTimes(1)
  })

  it('does not clear the resumable draft when session creation fails', async () => {
    const createCookingSession = vi.fn(async () => { throw new Error('write failed') })
    const clear = vi.fn(async () => undefined)

    await expect(finalizeCookingDraft(
      draft,
      { createCookingSession },
      { clear },
      { preparedYield: null, sharedObservation: null },
    )).rejects.toThrow('write failed')

    expect(clear).not.toHaveBeenCalled()
  })
})
