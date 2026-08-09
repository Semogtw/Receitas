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

describe('ShoppingLists', () => {
  it('switches between named lists and marks the active one', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <ShoppingLists
        lists={[mercado, atacado]}
        activeListId={mercado.id}
        onSelect={onSelect}
        onCreate={vi.fn()}
        onSetDefault={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /Mercado/ }).getAttribute('aria-pressed')).toBe('true')
    await user.click(screen.getByRole('button', { name: /Atacado/ }))
    expect(onSelect).toHaveBeenCalledWith(atacado.id)
  })

  it('creates a new named list', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn(async () => undefined)
    render(
      <ShoppingLists
        lists={[]}
        activeListId={null}
        onSelect={vi.fn()}
        onCreate={onCreate}
        onSetDefault={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText('Nova lista'), 'Feira')
    await user.click(screen.getByRole('button', { name: 'Criar' }))
    expect(onCreate).toHaveBeenCalledWith('Feira')
  })

  it('requests an explicit default switch only for a non-default list', async () => {
    const user = userEvent.setup()
    const onSetDefault = vi.fn(async () => undefined)
    render(
      <ShoppingLists
        lists={[mercado, atacado]}
        activeListId={mercado.id}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onSetDefault={onSetDefault}
      />,
    )

    expect(screen.getByLabelText('Lista padrão')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Definir Atacado como lista padrão' }))
    expect(onSetDefault).toHaveBeenCalledWith(atacado.id)
  })
})
