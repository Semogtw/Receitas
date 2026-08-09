import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RecipeSummary } from '../../recipes/data/recipe-repository'
import type { MealPeriod, MealPlanEntry } from '../domain/types'
import { PlannerView } from './PlannerView'

const period: MealPeriod = {
  id: '50000000-0000-4000-8000-000000000005',
  pairId: '20000000-0000-4000-8000-000000000002',
  name: 'Jantar',
  position: 0,
  revision: 1,
  deletedAt: null,
}
const recipe: RecipeSummary = {
  id: '40000000-0000-4000-8000-000000000004',
  title: 'Macarrão de panela',
  description: null,
  favorite: true,
  wantToMake: false,
  baseYield: { numerator: 2, denominator: 1 },
  baseYieldUnit: 'porções',
  prepTimeSeconds: 300,
  cookTimeSeconds: 900,
  totalTimeSeconds: 1200,
  updatedAt: '2026-08-08T12:00:00.000Z',
}
const entry: MealPlanEntry = {
  id: '60000000-0000-4000-8000-000000000006',
  pairId: period.pairId,
  recipeId: recipe.id,
  date: '2026-08-08',
  mealPeriodId: period.id,
  time: '19:30',
  servings: { numerator: 3, denominator: 1 },
  note: 'Usar molho congelado',
  revision: 1,
  deletedAt: null,
}

function renderPlanner(overrides: Partial<Parameters<typeof PlannerView>[0]> = {}) {
  const props = {
    selectedDate: '2026-08-08',
    periods: [period],
    entries: [entry],
    recipes: [recipe],
    onSelectDate: vi.fn(),
    onAdd: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onOpenPeriodSettings: vi.fn(),
    ...overrides,
  }
  render(<PlannerView {...props} />)
  return props
}

describe('PlannerView', () => {
  it('renders selected-day meals grouped by custom period', () => {
    renderPlanner()

    expect(screen.getByRole('heading', { name: 'Jantar' })).toBeTruthy()
    expect(screen.getByText('Macarrão de panela')).toBeTruthy()
    expect(screen.getByText('19:30')).toBeTruthy()
    expect(screen.getByText('3 porções')).toBeTruthy()
    expect(screen.getByText('Usar molho congelado')).toBeTruthy()
  })

  it('navigates weeks and selects a visible day without changing date semantics', async () => {
    const user = userEvent.setup()
    const props = renderPlanner()

    await user.click(screen.getByRole('button', { name: 'Próxima semana' }))
    expect(props.onSelectDate).toHaveBeenCalledWith('2026-08-15')

    await user.click(screen.getByRole('button', { name: /sexta/i }))
    expect(props.onSelectDate).toHaveBeenCalledWith('2026-08-07')
  })

  it('opens editing from the meal row and exposes a dedicated delete action', async () => {
    const user = userEvent.setup()
    const props = renderPlanner()
    const editButton = screen.getByText('Macarrão de panela').closest('button')
    if (!editButton) throw new Error('Planner entry edit button was not rendered')

    await user.click(editButton)
    expect(props.onEdit).toHaveBeenCalledWith(entry)

    await user.click(screen.getByRole('button', { name: 'Remover Macarrão de panela do planejamento' }))
    expect(props.onDelete).toHaveBeenCalledWith(entry)
  })

  it('keeps legacy entries without a meal period visible and editable', async () => {
    const user = userEvent.setup()
    const unassigned = { ...entry, id: 'legacy-entry', mealPeriodId: null }
    const props = renderPlanner({ entries: [unassigned] })

    expect(screen.getByRole('heading', { name: 'Sem período' })).toBeTruthy()
    expect(screen.getByText('Escolha um período ao editar estas refeições.')).toBeTruthy()
    const editButton = screen.getByText('Macarrão de panela').closest('button')
    if (!editButton) throw new Error('Unassigned planner entry edit button was not rendered')
    await user.click(editButton)
    expect(props.onEdit).toHaveBeenCalledWith(unassigned)
  })

  it('shows a period setup path instead of fake fixed meal periods', async () => {
    const user = userEvent.setup()
    const props = renderPlanner({ periods: [], entries: [] })

    expect(screen.getByText('Crie o primeiro período')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Configurar períodos' }))
    expect(props.onOpenPeriodSettings).toHaveBeenCalledTimes(1)
  })
})
