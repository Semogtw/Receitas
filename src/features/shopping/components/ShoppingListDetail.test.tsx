import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ShoppingItem, ShoppingList } from '../domain/types'
import { ShoppingListDetail } from './ShoppingListDetail'

const list: ShoppingList = {
  id: '71000000-0000-4000-8000-000000000001',
  pairId: '20000000-0000-4000-8000-000000000002',
  name: 'Mercado',
  isDefault: true,
  revision: 1,
  deletedAt: null,
}

const item: ShoppingItem = {
  id: '72000000-0000-4000-8000-000000000001',
  listId: list.id,
  pairId: list.pairId,
  name: 'Farinha',
  normalizedName: 'farinha',
  amount: { kind: 'numeric', value: { numerator: 1, denominator: 2 } },
  unit: 'kg',
  source: { kind: 'recipe', recipeId: 'recipe-a' },
  sources: [
    { kind: 'recipe', recipeId: 'recipe-a' },
    { kind: 'planner', recipeId: 'recipe-b', mealPlanEntryId: 'plan-a' },
  ],
  purchased: false,
  revision: 1,
  deletedAt: null,
}

function renderDetail(items: ShoppingItem[] = [item]) {
  const props = {
    list,
    items,
    onAddManual: vi.fn(async () => undefined),
    onUpdate: vi.fn(async () => undefined),
    onToggle: vi.fn(async () => undefined),
    onDelete: vi.fn(async () => undefined),
    onOpenGenerate: vi.fn(),
  }
  render(<ShoppingListDetail {...props} />)
  return props
}

describe('ShoppingListDetail', () => {
  it('adds a manual item without inventing a quantity', async () => {
    const user = userEvent.setup()
    const props = renderDetail([])

    await user.type(screen.getByLabelText('Adicionar item'), 'Tomate')
    await user.click(screen.getByRole('button', { name: 'Adicionar' }))

    expect(props.onAddManual).toHaveBeenCalledWith({
      name: 'Tomate',
      normalizedName: 'tomate',
      amount: { kind: 'none' },
      unit: null,
      source: { kind: 'manual' },
    })
  })

  it('marks an item as purchased through the shared callback', async () => {
    const user = userEvent.setup()
    const props = renderDetail()

    await user.click(screen.getByRole('checkbox', { name: 'Marcar Farinha' }))
    expect(props.onToggle).toHaveBeenCalledWith(item.id, true)
  })

  it('edits amount and unit while retaining item identity', async () => {
    const user = userEvent.setup()
    const props = renderDetail()

    await user.click(screen.getByRole('button', { name: 'Editar Farinha' }))
    const amount = screen.getByLabelText('Quantidade de Farinha')
    const unit = screen.getByLabelText('Unidade de Farinha')
    await user.clear(amount)
    await user.type(amount, '750')
    await user.clear(unit)
    await user.type(unit, 'g')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(props.onUpdate).toHaveBeenCalledWith(item.id, {
      amount: { kind: 'numeric', value: { numerator: 750, denominator: 1 } },
      unit: 'g',
    })
  })

  it('shows generated provenance on demand', async () => {
    const user = userEvent.setup()
    renderDetail()

    await user.click(screen.getByText('2 origens'))
    expect(screen.getByText('Gerado por receita')).toBeTruthy()
    expect(screen.getByText('Gerado pelo planejamento')).toBeTruthy()
  })
})
