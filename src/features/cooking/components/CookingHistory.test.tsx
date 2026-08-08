import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CookingSessionSummary } from '../domain/cooking-session'
import { CookingHistory } from './CookingHistory'

const session: CookingSessionSummary = {
  id: 'a0000000-0000-4000-8000-00000000000a',
  recipeId: '40000000-0000-4000-8000-000000000004',
  recordedBy: 'user-a',
  startedAt: '2026-08-07T19:00:00.000Z',
  preparedAt: '2026-08-07T20:00:00.000Z',
  preparedYield: { numerator: 6, denominator: 1 },
  sharedObservation: 'Assar cinco minutos a menos.',
  snapshot: {
    version: 1,
    recipeId: '40000000-0000-4000-8000-000000000004',
    recipeRevision: 2,
    title: 'Bolo simples',
    description: null,
    baseYield: { numerator: 4, denominator: 1 },
    baseYieldUnit: 'porções',
    prepTimeSeconds: 600,
    cookTimeSeconds: 1200,
    totalTimeSeconds: 1800,
    ingredients: [],
    steps: [],
  },
  ratings: [
    {
      id: 'rating-a', sessionId: 'a0000000-0000-4000-8000-00000000000a', userId: 'user-a',
      score: 8.5, comment: 'Eu gostei da textura.', updatedAt: '2026-08-07T20:05:00.000Z',
    },
    {
      id: 'rating-b', sessionId: 'a0000000-0000-4000-8000-00000000000a', userId: 'user-b',
      score: 9.5, comment: 'Eu colocaria mais canela.', updatedAt: '2026-08-07T20:06:00.000Z',
    },
  ],
  averageScore: 9,
}

describe('CookingHistory', () => {
  it('shows source ratings separately instead of only an aggregate', () => {
    render(<CookingHistory sessions={[session]} currentUserId="user-a" />)

    expect(screen.getByText('Média 9/10')).toBeInTheDocument()
    expect(screen.getByText('Minha avaliação')).toBeInTheDocument()
    expect(screen.getByText('8,5/10')).toBeInTheDocument()
    expect(screen.getByText('Eu gostei da textura.')).toBeInTheDocument()
    expect(screen.getByText('Outra pessoa')).toBeInTheDocument()
    expect(screen.getByText('9,5/10')).toBeInTheDocument()
    expect(screen.getByText('Eu colocaria mais canela.')).toBeInTheDocument()
  })

  it('keeps shared observations visibly separate from personal comments', () => {
    render(<CookingHistory sessions={[session]} currentUserId="user-a" />)

    expect(screen.getByText('Observação compartilhada')).toBeInTheDocument()
    expect(screen.getByText('Assar cinco minutos a menos.')).toBeInTheDocument()
  })

  it('shows missing ratings as missing, never as zero', () => {
    render(<CookingHistory sessions={[{ ...session, ratings: [], averageScore: null }]} currentUserId="user-a" />)

    expect(screen.getByText('Sem avaliações ainda')).toBeInTheDocument()
    expect(screen.queryByText('0/10')).not.toBeInTheDocument()
  })
})
