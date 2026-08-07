import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PwaLifecycle } from './PwaLifecycle'

const setOfflineReady = vi.fn()
const setNeedRefresh = vi.fn()
const updateServiceWorker = vi.fn()
let offlineReady = false
let needRefresh = false

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  }),
}))

describe('PwaLifecycle', () => {
  beforeEach(() => {
    offlineReady = false
    needRefresh = false
    setOfflineReady.mockReset()
    setNeedRefresh.mockReset()
    updateServiceWorker.mockReset()
  })

  it('renders nothing while there is no PWA lifecycle notice', () => {
    const { container } = render(<PwaLifecycle />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a dismissible offline-ready notice', () => {
    offlineReady = true
    render(<PwaLifecycle />)

    expect(screen.getByText('Pronto para usar offline')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(setOfflineReady).toHaveBeenCalledWith(false)
  })

  it('updates only after explicit user action', () => {
    needRefresh = true
    render(<PwaLifecycle />)

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar agora' }))
    expect(updateServiceWorker).toHaveBeenCalledWith(true)
  })
})
