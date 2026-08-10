import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CookingDraft } from '../domain/cooking-draft'
import type { RecipeAggregate } from '../../recipes/data/recipe-repository'

const fakes = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  clear: vi.fn(),
  createCookingSession: vi.fn(),
  setMyRating: vi.fn(),
  listRecipeHistory: vi.fn(),
}))

vi.mock('../data/local-cooking-draft-store', () => ({
  LocalCookingDraftStore: class {
    load = fakes.load
    save = fakes.save
    clear = fakes.clear
  },
}))

vi.mock('../data/cooking-repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/cooking-repository')>()
  return {
    ...actual,
    CookingRepository: class {
      createCookingSession = fakes.createCookingSession
      setMyRating = fakes.setMyRating
      listRecipeHistory = fakes.listRecipeHistory
    },
  }
})

import { CookingWorkspace } from './CookingWorkspace'

const recipe: RecipeAggregate = {
  id: 'recipe-a',
  revision: 2,
  title: 'Bolo simples',
  description: null,
  favorite: false,
  wantToMake: false,
  baseYield: { numerator: 4, denominator: 1 },
  baseYieldUnit: 'porções',
  prepTimeSeconds: 600,
  cookTimeSeconds: 1200,
  totalTimeSeconds: 1800,
  updatedAt: '2026-08-07T20:00:00.000Z',
  ingredients: [],
  steps: [
    { id: 'step-a', recipeId: 'recipe-a', position: 0, instruction: 'Misture.', durationSeconds: null, note: null },
    { id: 'step-b', recipeId: 'recipe-a', position: 1, instruction: 'Asse.', durationSeconds: null, note: null },
  ],
}

const existingDraft: CookingDraft = {
  version: 1,
  id: 'draft-a',
  finalizationSessionId: 'session-a',
  recipeSnapshot: {
    version: 1,
    recipeId: 'recipe-a',
    recipeRevision: 2,
    title: 'Bolo simples',
    description: null,
    baseYield: { numerator: 4, denominator: 1 },
    baseYieldUnit: 'porções',
    prepTimeSeconds: 600,
    cookTimeSeconds: 1200,
    totalTimeSeconds: 1800,
    ingredients: [],
    steps: [
      { id: 'step-a', position: 0, instruction: 'Misture.', durationSeconds: null, note: null },
      { id: 'step-b', position: 1, instruction: 'Asse.', durationSeconds: null, note: null },
    ],
  },
  startedAt: '2026-08-07T20:00:00.000Z',
  currentStepIndex: 0,
  servingMultiplier: { numerator: 1, denominator: 1 },
  timers: [],
}

describe('CookingWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fakes.load.mockResolvedValue(existingDraft)
    fakes.save.mockResolvedValue(undefined)
    fakes.clear.mockResolvedValue(undefined)
    fakes.createCookingSession.mockResolvedValue('session-a')
    fakes.setMyRating.mockResolvedValue('rating-a')
    fakes.listRecipeHistory.mockResolvedValue([])
  })

  it('resumes the active draft for the same recipe and persists step changes', async () => {
    const user = userEvent.setup()
    const onExit = vi.fn()
    render(
      <CookingWorkspace
        database={{} as never}
        pairId="pair-a"
        actorUserId="user-a"
        recipe={recipe}
        onExit={onExit}
      />,
    )

    expect(await screen.findByRole('heading', { name: 'Misture.' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Próxima etapa' }))

    await waitFor(() => expect(fakes.save).toHaveBeenCalledWith(expect.objectContaining({ currentStepIndex: 1 })))
    expect(fakes.clear).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Sair do modo cozinhar' }))
    expect(onExit).toHaveBeenCalledTimes(1)
    expect(fakes.clear).not.toHaveBeenCalled()
  })

  it('restores the persisted step after a full workspace remount', async () => {
    const user = userEvent.setup()
    let persistedDraft: CookingDraft = existingDraft

    fakes.load.mockImplementation(async () => persistedDraft)
    fakes.save.mockImplementation(async (next: CookingDraft) => {
      persistedDraft = next
    })

    const firstMount = render(
      <CookingWorkspace
        database={{} as never}
        pairId="pair-a"
        actorUserId="user-a"
        recipe={recipe}
        onExit={vi.fn()}
      />,
    )

    expect(await screen.findByRole('heading', { name: 'Misture.' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Próxima etapa' }))
    await waitFor(() => expect(persistedDraft.currentStepIndex).toBe(1))

    firstMount.unmount()

    render(
      <CookingWorkspace
        database={{} as never}
        pairId="pair-a"
        actorUserId="user-a"
        recipe={recipe}
        onExit={vi.fn()}
      />,
    )

    expect(await screen.findByRole('heading', { name: 'Asse.' })).toBeInTheDocument()
    expect(fakes.load).toHaveBeenCalledTimes(2)
    expect(fakes.clear).not.toHaveBeenCalled()
  })

  it('requires an explicit choice before replacing a draft from another recipe', async () => {
    const user = userEvent.setup()
    fakes.load.mockResolvedValue({
      ...existingDraft,
      id: 'draft-other',
      recipeSnapshot: { ...existingDraft.recipeSnapshot, recipeId: 'recipe-other', title: 'Sopa em andamento' },
    })

    render(
      <CookingWorkspace
        database={{} as never}
        pairId="pair-a"
        actorUserId="user-a"
        recipe={recipe}
        onExit={vi.fn()}
      />,
    )

    expect(await screen.findByText(/Sopa em andamento/)).toBeInTheDocument()
    expect(fakes.save).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Substituir por Bolo simples' }))
    await waitFor(() => expect(fakes.save).toHaveBeenCalledWith(expect.objectContaining({
      recipeSnapshot: expect.objectContaining({ recipeId: 'recipe-a' }),
    })))
  })
})
