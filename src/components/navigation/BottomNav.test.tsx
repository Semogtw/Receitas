import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { BottomNav } from './BottomNav'

describe('BottomNav', () => {
  it('exposes the five stable destinations with text labels', () => {
    render(
      <MemoryRouter>
        <BottomNav currentPath="/recipes" />
      </MemoryRouter>,
    )

    for (const label of ['Receitas', 'Planejar', 'Compras', 'Histórico', 'Configurações']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
  })

  it('marks the current destination', () => {
    render(
      <MemoryRouter>
        <BottomNav currentPath="/shopping" />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Compras' })).toHaveAttribute('aria-current', 'page')
  })
})
