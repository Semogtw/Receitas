import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ImportPreview } from '../data/import-client'
import { ImportReview } from './ImportReview'

const preview: ImportPreview = {
  strategy: 'schema_org',
  draft: {
    title: 'Bolo importado',
    description: 'Descrição original',
    sourceUrl: 'https://example.com/bolo',
    servings: '8 porções',
    prepTimeMinutes: 10,
    cookTimeMinutes: 30,
    ingredients: [
      { raw: '2 xícaras de farinha' },
      { raw: '1 ovo' },
    ],
    steps: [
      { instruction: 'Misture.' },
      { instruction: 'Asse.' },
    ],
    imageUrl: 'https://example.com/bolo.jpg',
    warnings: ['Confira o rendimento.'],
  },
}

describe('ImportReview', () => {
  it('does not save until explicit confirmation and submits edited content', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn(async () => undefined)
    render(<ImportReview preview={preview} onConfirm={onConfirm} onBack={vi.fn()} onCancel={vi.fn()} />)

    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByText('Confira o rendimento.')).toBeTruthy()

    const title = screen.getByLabelText('Título')
    await user.clear(title)
    await user.type(title, 'Bolo revisado')

    const ingredient = screen.getByLabelText('Ingrediente 1')
    await user.clear(ingredient)
    await user.type(ingredient, '3 xícaras de farinha')
    await user.click(screen.getByRole('button', { name: 'Remover ingrediente 2' }))
    await user.click(screen.getByRole('button', { name: 'Remover etapa 2' }))
    await user.click(screen.getByRole('button', { name: 'Salvar no caderno' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({
      title: 'Bolo revisado',
      ingredients: [{ raw: '3 xícaras de farinha' }],
      steps: [{ instruction: 'Misture.' }],
    })
    expect(onConfirm.mock.calls[0]?.[1]).toBe('schema_org')
  })

  it('requires a title before enabling canonical save', async () => {
    const user = userEvent.setup()
    render(<ImportReview preview={preview} onConfirm={vi.fn()} onBack={vi.fn()} onCancel={vi.fn()} />)

    await user.clear(screen.getByLabelText('Título'))

    expect(screen.getByRole('button', { name: 'Salvar no caderno' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Informe um título')
  })

  it('cancels review without saving', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ImportReview preview={preview} onConfirm={onConfirm} onBack={vi.fn()} onCancel={onCancel} />)

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
