import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CookingSessionSummary } from '../domain/cooking-session'

const fakes = vi.hoisted(() => ({
  listRecipeHistory: vi.fn(),
  setMyRating: vi.fn(),
  registerListener: vi.fn((_listener: { crudUpdate(): void }) => vi.fn()),
}))

vi.mock('../data/cooking-repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/cooking-repository')>()
  return {
    ...actual,
    CookingRepository: class {
      listRecipeHistory = fakes.listRecipeHistory
      setMyRating = fakes.setMyRating
    },
  }
})

import { CookingHistoryPanel } from './CookingHistoryPanel'

const session: CookingSessionSummary = {
  id: 'session-a',
  recipeId: 'recipe-a',
  recordedBy: 'user-a',
  startedAt: null,
  preparedAt: '2026-08-07T20:00:00.000Z',
  preparedYield: null,
  sharedObservation: null,
  snapshot: {
    version: 1,
    recipeId: 'recipe-a',
    recipeRevision: 1,
    title: 'Bolo',
    description: null,
    baseYield: null,
    baseYieldUnit: null,
    prepTimeSeconds: null,
    cookTimeSeconds: null,
    totalTimeSeconds: null,
    ingredients: [],
    steps: [],
  },
  ratings: [
    {
      id: 'rating-a',
      sessionId: 'session-a',
      userId: 'user-a',
      score: 8.5,
      comment: 'Bom.',
      updatedAt: '2026-08-07T20:05:00.000Z',
    },
  ],
  averageScore: 8.5,
}

describe('CookingHistoryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fakes.listRecipeHistory.mockResolvedValue([session])
    fakes.setMyRating.mockResolvedValue('rating-a')
  })

  it('loads history and lets the current user update only their own rating', async () => {
    const user = userEvent.setup()
    const database = { registerListener: fakes.registerListener } as never
    render(
      <CookingHistoryPanel
        database={database}
        pairId="pair-a"
        actorUserId="user-a"
        recipeId="recipe-a"
      />,
    )

    expect(await screen.findByText('Minha avaliação')).toBeInTheDocument()
    await user.click(screen.getByText('Editar minha avaliação'))
    expect(screen.getByLabelText('Minha nota')).toHaveValue('8.5')

    await user.selectOptions(screen.getByLabelText('Minha nota'), '9')
    await user.clear(screen.getByLabelText('Meu comentário'))
    await user.type(screen.getByLabelText('Meu comentário'), 'Melhorou.')
    await user.click(screen.getByRole('button', { name: 'Salvar minha avaliação' }))

    await waitFor(() => expect(fakes.setMyRating).toHaveBeenCalledWith('session-a', 9, 'Melhorou.'))
  })

  it('refreshes when PowerSync reports a local database change', async () => {
    const database = { registerListener: fakes.registerListener } as never
    render(
      <CookingHistoryPanel
        database={database}
        pairId="pair-a"
        actorUserId="user-a"
        recipeId="recipe-a"
      />,
    )

    await screen.findByText('Minha avaliação')
    expect(fakes.registerListener).toHaveBeenCalledTimes(1)
    const listener = fakes.registerListener.mock.calls[0]?.[0]
    listener?.crudUpdate()
    await waitFor(() => expect(fakes.listRecipeHistory).toHaveBeenCalledTimes(2))
  })
})
