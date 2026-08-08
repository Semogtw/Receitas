import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CategorySelector } from './CategorySelector'

const categories = [
  { id: '70000000-0000-4000-8000-000000000007', name: 'Sobremesas' },
  { id: '70000000-0000-4000-8000-000000000008', name: 'Rápidas' },
]

describe('CategorySelector', () => {
  it('supports multiple simultaneous categories with native checkboxes', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <CategorySelector
        categories={categories}
        selectedIds={[categories[0]!.id]}
        onChange={onChange}
      />,
    )

    expect(screen.getByLabelText('Sobremesas')).toBeChecked()
    expect(screen.getByLabelText('Rápidas')).not.toBeChecked()

    await user.click(screen.getByLabelText('Rápidas'))
    expect(onChange).toHaveBeenLastCalledWith([categories[0]!.id, categories[1]!.id])
  })

  it('renders a useful empty state rather than an unusable fieldset', () => {
    render(<CategorySelector categories={[]} selectedIds={[]} onChange={vi.fn()} />)
    expect(screen.getByText('Nenhuma categoria cadastrada ainda.')).toBeInTheDocument()
  })
})
