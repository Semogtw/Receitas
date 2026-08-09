import type { PowerSyncDatabase } from '@powersync/web'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { DiagnosticStore } from '../store'
import { DiagnosticsScreen } from './DiagnosticsScreen'

const database = {} as PowerSyncDatabase
const pairId = '20000000-0000-4000-8000-000000000002'

function fakeStore() {
  let verboseUntil: string | null = null
  let events = [{
    id: 'event-1',
    timestamp: '2026-08-09T10:00:00.000Z',
    area: 'sync' as const,
    code: 'retry',
    severity: 'warning' as const,
    technicalContext: { retryCount: 1 },
  }]
  return {
    list: vi.fn(async () => events),
    verboseUntil: vi.fn(async () => verboseUntil),
    enableVerbose: vi.fn(async () => {
      verboseUntil = '2026-08-09T10:15:00.000Z'
      return verboseUntil
    }),
    disableVerbose: vi.fn(async () => { verboseUntil = null }),
    clear: vi.fn(async () => { events = [] }),
  } as unknown as DiagnosticStore
}

describe('DiagnosticsScreen', () => {
  it('enables a time-bounded verbose mode and can clear only local diagnostics', async () => {
    const user = userEvent.setup()
    const store = fakeStore()
    render(<DiagnosticsScreen database={database} pairId={pairId} appVersion="1.0.0" store={store} />)

    expect(await screen.findByText(/1 eventos sanitizados/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Modo verboso por 15 min' }))
    expect(store.enableVerbose).toHaveBeenCalledWith(15 * 60 * 1000)
    expect(await screen.findByRole('button', { name: 'Desligar modo verboso' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Limpar histórico local' }))
    expect(store.clear).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/0 eventos sanitizados/)).toBeTruthy()
  })

  it('exports only through the diagnostics artifact boundary', async () => {
    const user = userEvent.setup()
    const store = fakeStore()
    const artifactFactory = vi.fn(async () => ({
      filename: 'receitas-diagnostics-test.json',
      bytes: 123,
      file: new File(['{}'], 'receitas-diagnostics-test.json', { type: 'application/json' }),
      payload: {} as never,
    }))
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    render(
      <DiagnosticsScreen
        database={database}
        pairId={pairId}
        appVersion="1.0.0"
        store={store}
        artifactFactory={artifactFactory}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Exportar diagnósticos' }))

    expect(artifactFactory).toHaveBeenCalledWith({ database, pairId, appVersion: '1.0.0', store })
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/receitas-diagnostics-test.json/)).toBeTruthy()

    createObjectURL.mockRestore()
    revokeObjectURL.mockRestore()
    click.mockRestore()
  })
})
