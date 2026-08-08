import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RatingForm } from './RatingForm'

describe('RatingForm', () => {
  it('submits one personal score and comment in half-point increments', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async () => undefined)
    render(<RatingForm onSave={onSave} />)

    await user.selectOptions(screen.getByLabelText('Minha nota'), '8.5')
    await user.type(screen.getByLabelText('Meu comentário'), 'Faria de novo.')
    await user.click(screen.getByRole('button', { name: 'Salvar minha avaliação' }))

    expect(onSave).toHaveBeenCalledWith({ score: 8.5, comment: 'Faria de novo.' })
  })

  it('can update an existing personal rating without implying the other person agrees', () => {
    render(<RatingForm initial={{ score: 7, comment: 'Bom.' }} onSave={vi.fn()} />)

    expect(screen.getByLabelText('Minha nota')).toHaveValue('7')
    expect(screen.getByLabelText('Meu comentário')).toHaveValue('Bom.')
    expect(screen.getByText(/individual/)).toBeInTheDocument()
  })
})
