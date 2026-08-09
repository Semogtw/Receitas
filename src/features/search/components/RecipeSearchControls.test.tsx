import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EMPTY_RECIPE_SEARCH_QUERY } from '../domain/search'
import { RecipeSearchControls } from './RecipeSearchControls'

function renderControls() {
  const onChange = vi.fn()
  render(
    <RecipeSearchControls
      query={{ ...EMPTY_RECIPE_SEARCH_QUERY }}
      categories={[{ id: 'quick', name: 'Rápido' }, { id: 'dessert', name: 'Sobremesas' }]}
      resultCount={4}
      totalCount={4}
      onChange={onChange}
    />,
  )
  return onChange
}

describe('RecipeSearchControls', () => {
  it('updates text search without changing the other criteria', async () => {
    const user = userEvent.setup()
    const onChange = renderControls()

    await user.type(screen.getByLabelText('Buscar receitas'), 'massa')

    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_RECIPE_SEARCH_QUERY, text: 'a' })
  })

  it('activates independent state filters', async () => {
    const user = userEvent.setup()
    const onChange = renderControls()

    await user.click(screen.getByRole('button', { name: 'Favoritas' }))
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_RECIPE_SEARCH_QUERY, favorite: true })
  })

  it('adds a selected category to the query', async () => {
    const user = userEvent.setup()
    const onChange = renderControls()

    await user.click(screen.getByText('Categorias'))
    await user.click(screen.getByRole('checkbox', { name: 'Rápido' }))
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_RECIPE_SEARCH_QUERY, categoryIds: ['quick'] })
  })

  it('changes sort independently from filters', async () => {
    const user = userEvent.setup()
    const onChange = renderControls()

    await user.selectOptions(screen.getByLabelText('Ordenar'), 'best_rated')
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_RECIPE_SEARCH_QUERY, sort: 'best_rated' })
  })
})
