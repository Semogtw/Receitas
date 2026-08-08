import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CookingDraft } from '../domain/cooking-draft'
import { CookingMode } from './CookingMode'

const draft: CookingDraft = {
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
      { id: 'step-a', position: 0, instruction: 'Misture os ingredientes.', durationSeconds: 120, note: null },
      { id: 'step-b', position: 1, instruction: 'Leve ao forno.', durationSeconds: 900, note: 'Forno preaquecido.' },
    ],
  },
  startedAt: '2026-08-07T20:00:00.000Z',
  currentStepIndex: 0,
  servingMultiplier: { numerator: 1, denominator: 1 },
  timers: [],
}

describe('CookingMode', () => {
  it('moves one step at a time and emits a persistable draft update', async () => {
    const user = userEvent.setup()
    const onDraftChange = vi.fn(async () => undefined)
    render(<CookingMode draft={draft} onDraftChange={onDraftChange} onFinish={vi.fn()} onExit={vi.fn()} />)

    expect(screen.getByText('Etapa 1 de 2')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Misture os ingredientes.' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Próxima etapa' }))

    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({ currentStepIndex: 1 }))
  })

  it('shows the finalization action on the last step', async () => {
    const user = userEvent.setup()
    const onFinish = vi.fn()
    render(<CookingMode draft={{ ...draft, currentStepIndex: 1 }} onDraftChange={vi.fn()} onFinish={onFinish} onExit={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Leve ao forno.' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Finalizar preparo' }))
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  it('keeps a visible exit action so cooking mode never traps navigation', () => {
    render(<CookingMode draft={draft} onDraftChange={vi.fn()} onFinish={vi.fn()} onExit={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Sair do modo cozinhar' })).toBeInTheDocument()
  })
})
