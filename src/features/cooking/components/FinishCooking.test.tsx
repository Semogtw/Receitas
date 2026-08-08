import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FinishCooking } from './FinishCooking'

describe('FinishCooking', () => {
  it('submits exact prepared yield and shared observation separately', async () => {
    const user = userEvent.setup()
    const onFinish = vi.fn(async () => undefined)
    render(
      <FinishCooking
        baseYield={{ numerator: 4, denominator: 1 }}
        baseYieldUnit="porções"
        onFinish={onFinish}
      />,
    )

    await user.clear(screen.getByLabelText('Rendimento preparado'))
    await user.type(screen.getByLabelText('Rendimento preparado'), '6 1/2')
    await user.type(screen.getByLabelText('Observação compartilhada'), 'Assar menos da próxima vez.')
    await user.click(screen.getByRole('button', { name: 'Finalizar preparo' }))

    expect(onFinish).toHaveBeenCalledWith({
      preparedYield: { numerator: 13, denominator: 2 },
      sharedObservation: 'Assar menos da próxima vez.',
    })
  })

  it('rejects free-text prepared yield instead of inventing a numeric value', async () => {
    const user = userEvent.setup()
    const onFinish = vi.fn()
    render(<FinishCooking onFinish={onFinish} />)

    await user.type(screen.getByLabelText('Rendimento preparado'), 'a gosto')
    await user.click(screen.getByRole('button', { name: 'Finalizar preparo' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('rendimento')
    expect(onFinish).not.toHaveBeenCalled()
  })

  it('can finish without a yield or observation when they were not recorded', async () => {
    const user = userEvent.setup()
    const onFinish = vi.fn(async () => undefined)
    render(<FinishCooking onFinish={onFinish} />)

    await user.click(screen.getByRole('button', { name: 'Finalizar preparo' }))

    expect(onFinish).toHaveBeenCalledWith({ preparedYield: null, sharedObservation: null })
  })
})
