import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RecipeEditor } from './RecipeEditor'

const dessert = { id: '70000000-0000-4000-8000-000000000007', name: 'Sobremesas' }
const quick = { id: '70000000-0000-4000-8000-000000000008', name: 'Rápidas' }

describe('RecipeEditor categories', () => {
  it('returns the selected category ids separately from the recipe payload', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async () => undefined)
    render(
      <RecipeEditor
        availableCategories={[dessert, quick]}
        initialCategoryIds={[dessert.id]}
        onSave={onSave}
      />,
    )

    await user.type(screen.getByLabelText('Título'), 'Bolo')
    expect(screen.getByLabelText('Sobremesas')).toBeChecked()
    await user.click(screen.getByLabelText('Rápidas'))
    await user.click(screen.getByRole('button', { name: 'Salvar receita' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0]?.[1]).toEqual([dessert.id, quick.id])
    expect(onSave.mock.calls[0]?.[0]).not.toHaveProperty('categoryIds')
  })
})
