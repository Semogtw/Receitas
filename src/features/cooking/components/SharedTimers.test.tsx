import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CookingTimer } from '../domain/timers'
import { SharedTimers } from './SharedTimers'

const timer: CookingTimer = {
  id: 'timer-a',
  label: 'Forno',
  durationSeconds: 300,
  targetAt: null,
  pausedRemainingSeconds: 300,
}

describe('SharedTimers', () => {
  it('adds a named timer with an exact integer-second duration', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SharedTimers timers={[]} onChange={onChange} />)

    await user.type(screen.getByLabelText('Nome do timer'), 'Descanso')
    await user.type(screen.getByLabelText('Duração do timer em minutos'), '1.5')
    await user.click(screen.getByRole('button', { name: 'Adicionar timer' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]?.[0][0]).toMatchObject({
      label: 'Descanso',
      durationSeconds: 90,
      targetAt: null,
      pausedRemainingSeconds: 90,
    })
  })

  it('offers start and remove controls for a persisted timer', () => {
    render(<SharedTimers timers={[timer]} onChange={vi.fn()} />)

    expect(screen.getByText('Forno')).toBeInTheDocument()
    expect(screen.getByText('05:00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Iniciar timer Forno' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remover timer Forno' })).toBeInTheDocument()
  })
})
