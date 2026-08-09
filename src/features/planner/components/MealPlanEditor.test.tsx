import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RecipeSummary } from '../../recipes/data/recipe-repository'
import type { MealPeriod } from '../domain/types'
import { MealPlanEditor } from './MealPlanEditor'

const recipe: RecipeSummary = {
  id: '40000000-0000-4000-8000-000000000004',
  title: 'Panqueca',
  description: null,
  favorite: false,
  wantToMake: true,
  baseYield: { numerator: 2, denominator: 1 },
  baseYieldUnit: 'porções',
  prepTimeSeconds: null,
  cookTimeSeconds: null,
  totalTimeSeconds: null,
  updatedAt: '2026-08-08T12:00:00.000Z',
}
const period: MealPeriod = {
  id: '50000000-0000-4000-8000-000000000005',
  pairId: '20000000-0000-4000-8000-000000000002',
  name: 'Almoço',
  position: 0,
  revision: 1,
  deletedAt: null,
}

describe('MealPlanEditor', () => {
  it('saves date-only planning, local clock time and exact rational servings', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async () => undefined)
    render(
      <MealPlanEditor
        date="2026-08-10"
        recipes={[recipe]}
        periods={[period]}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText('Horário opcional'), '19:30')
    await user.type(screen.getByLabelText('Porções opcionais'), '2,5')
    await user.type(screen.getByLabelText('Observação'), 'Jantar antecipado')
    await user.click(screen.getByRole('button', { name: 'Salvar planejamento' }))

    expect(onSave).toHaveBeenCalledWith({
      recipeId: recipe.id,
      date: '2026-08-10',
      mealPeriodId: period.id,
      time: '19:30',
      servings: { numerator: 5, denominator: 2 },
      note: 'Jantar antecipado',
    })
  })

  it('rejects human text in the servings field instead of coercing it', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async () => undefined)
    render(
      <MealPlanEditor
        date="2026-08-10"
        recipes={[recipe]}
        periods={[period]}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText('Porções opcionais'), 'algumas')
    await user.click(screen.getByRole('button', { name: 'Salvar planejamento' }))

    expect(screen.getByRole('alert').textContent).toContain('quantidade numérica')
    expect(onSave).not.toHaveBeenCalled()
  })
})
