import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PwaStatusBanner } from './PwaStatusBanner'

describe('PwaStatusBanner', () => {
  it('warns about unsaved fields before an explicit update', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    render(
      <PwaStatusBanner
        offlineReady={false}
        needRefresh
        onUpdate={onUpdate}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getByText('Nova versão disponível')).toBeInTheDocument()
    expect(screen.getByText(/campos de formulário ainda não salvos podem ser perdidos/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Atualizar agora' }))
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  it('allows deferring an update without triggering it', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    const onDismiss = vi.fn()
    render(
      <PwaStatusBanner
        offlineReady={false}
        needRefresh
        onUpdate={onUpdate}
        onDismiss={onDismiss}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Depois' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('shows offline readiness without offering an update action', () => {
    render(
      <PwaStatusBanner
        offlineReady
        needRefresh={false}
        onUpdate={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getByText('Pronto para usar offline')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Atualizar agora' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeInTheDocument()
  })

  it('keeps the current app usable and offers retry after update failure', () => {
    render(
      <PwaStatusBanner
        offlineReady={false}
        needRefresh={false}
        updateError
        onUpdate={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getByText('Não foi possível aplicar a atualização')).toBeInTheDocument()
    expect(screen.getByText(/versão atual continua funcionando/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Atualizar agora' })).toBeInTheDocument()
  })
})
