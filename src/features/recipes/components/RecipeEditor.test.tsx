import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RecipeEditor } from './RecipeEditor'

describe('RecipeEditor', () => {
  it('builds a structured recipe with exact ingredient amounts and stable child ids', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async () => undefined)
    render(<RecipeEditor onSave={onSave} />)

    await user.type(screen.getByLabelText('Título'), 'Bolo de caneca')
    await user.click(screen.getByRole('button', { name: 'Adicionar ingrediente' }))

    const amount = screen.getByLabelText('Quantidade do ingrediente 1')
    const unit = screen.getByLabelText('Unidade do ingrediente 1')
    const name = screen.getByLabelText('Nome do ingrediente 1')
    await user.type(amount, '1 1/2')
    await user.type(unit, 'xícara')
    await user.type(name, 'Farinha')

    await user.click(screen.getByRole('button', { name: 'Adicionar etapa' }))
    await user.type(screen.getByLabelText('Instrução da etapa 1'), 'Misture os ingredientes.')
    await user.type(screen.getByLabelText('Duração em minutos da etapa 1'), '2')
    await user.click(screen.getByLabelText('Favorita'))
    await user.click(screen.getByRole('button', { name: 'Salvar receita' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    const saved = onSave.mock.calls[0]?.[0]
    expect(saved.title).toBe('Bolo de caneca')
    expect(saved.favorite).toBe(true)
    expect(saved.ingredients).toHaveLength(1)
    expect(saved.ingredients[0].id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(saved.ingredients[0].amount).toEqual({ kind: 'numeric', value: { numerator: 3, denominator: 2 } })
    expect(saved.steps[0]).toMatchObject({ instruction: 'Misture os ingredientes.', durationSeconds: 120 })
  })

  it('supports keyboard-accessible reordering without replacing ingredient identity', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async () => undefined)
    render(<RecipeEditor onSave={onSave} />)

    await user.type(screen.getByLabelText('Título'), 'Teste')
    await user.click(screen.getByRole('button', { name: 'Adicionar ingrediente' }))
    await user.type(screen.getByLabelText('Nome do ingrediente 1'), 'Primeiro')
    await user.click(screen.getByRole('button', { name: 'Adicionar ingrediente' }))
    await user.type(screen.getByLabelText('Nome do ingrediente 2'), 'Segundo')

    const before = screen.getAllByTestId('ingredient-row').map((row) => row.getAttribute('data-id'))
    await user.click(screen.getByRole('button', { name: 'Mover ingrediente 2 para cima' }))
    const after = screen.getAllByTestId('ingredient-row').map((row) => row.getAttribute('data-id'))

    expect(after).toEqual([before[1], before[0]])
    await user.click(screen.getByRole('button', { name: 'Salvar receita' }))
    expect(onSave.mock.calls[0]?.[0].ingredients.map((item: { name: string }) => item.name)).toEqual(['Segundo', 'Primeiro'])
  })

  it('keeps text quantities such as a gosto instead of coercing them to numbers', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async () => undefined)
    render(<RecipeEditor onSave={onSave} />)

    await user.type(screen.getByLabelText('Título'), 'Molho')
    await user.click(screen.getByRole('button', { name: 'Adicionar ingrediente' }))
    await user.type(screen.getByLabelText('Quantidade do ingrediente 1'), 'a gosto')
    await user.type(screen.getByLabelText('Nome do ingrediente 1'), 'Sal')
    await user.click(screen.getByRole('button', { name: 'Salvar receita' }))

    expect(onSave.mock.calls[0]?.[0].ingredients[0].amount).toEqual({ kind: 'text', text: 'a gosto' })
  })
})
