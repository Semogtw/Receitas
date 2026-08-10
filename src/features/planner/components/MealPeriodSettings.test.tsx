import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { MealPeriod } from '../domain/types'
import { MealPeriodSettings } from './MealPeriodSettings'

const periods: MealPeriod[] = [
  { id: 'breakfast', pairId: 'pair', name: 'Café', position: 0, revision: 1, deletedAt: null },
  { id: 'dinner', pairId: 'pair', name: 'Jantar', position: 1, revision: 1, deletedAt: null },
]

function renderSettings(overrides: Partial<Parameters<typeof MealPeriodSettings>[0]> = {}) {
  return render(
    <MealPeriodSettings
      periods={periods}
      onCreate={vi.fn()}
      onRename={vi.fn()}
      onReorder={vi.fn()}
      onDelete={vi.fn()}
      onClose={vi.fn()}
      {...overrides}
    />,
  )
}

describe('MealPeriodSettings', () => {
  it('creates a user-defined meal period', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn(async () => undefined)
    renderSettings({ onCreate })

    await user.type(screen.getByLabelText('Novo período'), 'Café da tarde')
    await user.click(screen.getByRole('button', { name: 'Adicionar' }))
    expect(onCreate).toHaveBeenCalledWith('Café da tarde')
  })

  it('renames a period on field blur', async () => {
    const user = userEvent.setup()
    const onRename = vi.fn(async () => undefined)
    renderSettings({ onRename })

    const name = screen.getByDisplayValue('Café')
    await user.clear(name)
    await user.type(name, 'Café cedo')
    await user.tab()
    expect(onRename).toHaveBeenCalledWith('breakfast', 'Café cedo')
  })

  it('reorders periods with keyboard-accessible buttons', async () => {
    const user = userEvent.setup()
    const onReorder = vi.fn(async () => undefined)
    renderSettings({ onReorder })

    await user.click(screen.getByRole('button', { name: 'Mover Jantar para cima' }))
    expect(onReorder).toHaveBeenCalledWith(['dinner', 'breakfast'])
  })

  it('moves a period to the recoverable trash with an accessible action', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn(async () => undefined)
    renderSettings({ onDelete })

    await user.click(screen.getByRole('button', { name: 'Mover Café para a lixeira' }))
    expect(onDelete).toHaveBeenCalledWith('breakfast')
  })
})
