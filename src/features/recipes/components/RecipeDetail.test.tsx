import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RecipeAggregate } from '../data/recipe-repository'
import { RecipeDetail } from './RecipeDetail'

const recipe: RecipeAggregate = {
  id: '40000000-0000-4000-8000-000000000004',
  revision: 1,
  title: 'Bolo simples',
  description: 'Receita de domingo',
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
      id: '50000000-0000-4000-8000-000000000005', recipeId: '40000000-0000-4000-8000-000000000004', position: 0,
      amount: { kind: 'numeric', value: { numerator: 3, denominator: 2 } }, unit: 'xícara', name: 'Farinha',
      normalizedName: 'farinha', note: null, isApproximate: false, isOptional: false,
    },
    {
      id: '50000000-0000-4000-8000-000000000006', recipeId: '40000000-0000-4000-8000-000000000004', position: 1,
      amount: { kind: 'text', text: 'a gosto' }, unit: null, name: 'Canela',
      normalizedName: 'canela', note: null, isApproximate: true, isOptional: true,
    },
  ],
  steps: [
    {
      id: '60000000-0000-4000-8000-000000000006', recipeId: '40000000-0000-4000-8000-000000000004', position: 0,
      instruction: 'Misture tudo.', durationSeconds: 120, note: null,
    },
  ],
}

describe('RecipeDetail', () => {
  it('shows the canonical recipe and scales numeric ingredients without changing text amounts', async () => {
    const user = userEvent.setup()
    render(<RecipeDetail recipe={recipe} onEdit={vi.fn()} onDelete={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Bolo simples' })).toBeInTheDocument()
    expect(screen.getByText('1 1/2 xícara Farinha')).toBeInTheDocument()
    expect(screen.getByText('a gosto Canela')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '2×' }))
    expect(screen.getByText('3 xícara Farinha')).toBeInTheDocument()
    expect(screen.getByText('a gosto Canela')).toBeInTheDocument()
  })

  it('supports an exact target serving count and exposes edit/delete actions', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    render(<RecipeDetail recipe={recipe} onEdit={onEdit} onDelete={onDelete} />)

    await user.clear(screen.getByLabelText('Porções desejadas'))
    await user.type(screen.getByLabelText('Porções desejadas'), '6')
    expect(screen.getByText('2 1/4 xícara Farinha')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Editar receita' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Mover para a lixeira' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})
