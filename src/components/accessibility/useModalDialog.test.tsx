import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { useModalDialog } from './useModalDialog'

function Modal({ onClose }: { onClose(): void }) {
  const ref = useModalDialog<HTMLDivElement>(onClose)
  return <div ref={ref} tabIndex={-1} role="dialog" aria-label="Teste modal">Conteúdo</div>
}

describe('useModalDialog', () => {
  it('moves focus into the dialog, closes on Escape and restores previous focus on unmount', async () => {
    const user = userEvent.setup()
    const previous = document.createElement('button')
    previous.textContent = 'Anterior'
    document.body.append(previous)
    previous.focus()
    expect(previous).toHaveFocus()

    const onClose = vi.fn()
    const view = render(<Modal onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: 'Teste modal' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)

    view.unmount()
    expect(previous).toHaveFocus()
    previous.remove()
  })
})
