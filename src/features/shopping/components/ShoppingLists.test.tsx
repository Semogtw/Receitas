import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ShoppingList } from '../domain/types'
import { ShoppingLists } from './ShoppingLists'

const mercado: ShoppingList = {
  id: 'mercado',
  pairId: 'pair',
  name: 'Mercado',
  isDefault: true,
  revision: 1,
  deletedAt: null,
}
const atacado: ShoppingList = {
  ...mercado,
  id: 'atacado',
  name: 'Atacado',
  isDefault: false,
}

function renderLists(overrides: Partial<Parameters<typeof ShoppingLists>[0]> = {}) {
  return render(
    <ShoppingLists
      lists={[mercado, atacado]}
      activeListId={mercado.id}
      onSelect={vi.fn()}
      onCreate={vi.fn()}
      onSetDefault={vi.fn()}
      onDelete={vi.fn()}
      {...overrides}
    />,
  )
}

describe('ShoppingLists', () => {
  it('switches between named lists and marks the active one', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    renderLists({ onSelect })

    expect(screen.getByRole('button', { name: /Mercado/ }).getAttribute('aria-pressed')).toBe('true')
    await user.click(screen.getByRole('button', { name: /Atacado/ }))
    expect(onSelect).toHaveBeenCalledWith(atacado.id)
  })

  it('creates a new named list', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn(async () => undefined)
    renderLists({ lists: [], activeListId: null, onCreate })

    await user.type(screen.getByLabelText('Nova lista'), 'Feira')
    await user.click(screen.getByRole('button', { name: 'Criar' }))
    expect(onCreate).toHaveBeenCalledWith('Feira')
  })

  it('requests an explicit default switch only for a non-default list', async () => {
    const user = userEvent.setup()
    const onSetDefault = vi.fn(async () => undefined)
    renderLists({ onSetDefault })

    expect(screen.getByLabelText('Lista padrão')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Definir Atacado como lista padrão' }))
    expect(onSetDefault).toHaveBeenCalledWith(atacado.id)
  })

  it('moves a whole list to the recoverable trash through an explicit action', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn(async () => undefined)
    renderLists({ onDelete })

    await user.click(screen.getByRole('button', { name: 'Mover Atacado para a lixeira' }))
    expect(onDelete).toHaveBeenCalledWith(atacado.id)
  })
})
