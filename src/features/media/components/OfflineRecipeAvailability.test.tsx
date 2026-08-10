import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { OfflineRecipeAvailability } from './OfflineRecipeAvailability'

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value })
}

function createDatabase(media: Array<{ id: string; storage_path: string }> = []) {
  let preference: string | null = null
  const listeners: Array<() => void> = []
  return {
    database: {
      getOptional: vi.fn(async () => preference ? { value_json: preference } : null),
      getAll: vi.fn(async () => media),
      execute: vi.fn(async (sql: string, parameters: unknown[]) => {
        if (sql.includes('DELETE FROM device_preferences')) preference = null
        if (sql.includes('INSERT INTO device_preferences')) preference = String(parameters[1])
        return { rowsAffected: 1 }
      }),
      registerListener: vi.fn((listener: { crudUpdate?: () => void }) => {
        if (listener.crudUpdate) listeners.push(listener.crudUpdate)
        return () => undefined
      }),
    } as never,
    notifyCrud: () => listeners.forEach((listener) => listener()),
  }
}

describe('OfflineRecipeAvailability', () => {
  it('marks the recipe for offline use and reports complete cached media', async () => {
    setOnline(true)
    const user = userEvent.setup()
    const { database } = createDatabase([
      { id: 'photo-a', storage_path: 'pairs/pair-a/recipes/recipe-a/a.webp' },
    ])
    const cached = new Set<string>()
    const runtime = {
      hasCachedBlob: vi.fn(async (id: string) => cached.has(id)),
      resolveBlob: vi.fn(async (id: string) => {
        cached.add(id)
        return new Blob(['image'])
      }),
    }

    render(
      <OfflineRecipeAvailability
        database={database}
        pairId="pair-a"
        recipeId="recipe-a"
        runtime={runtime as never}
      />,
    )

    expect(await screen.findByRole('button', { name: 'Disponibilizar offline' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Disponibilizar offline' }))

    expect(await screen.findByText('1 de 1 fotos estão disponíveis neste dispositivo.')).toBeInTheDocument()
    expect(runtime.resolveBlob).toHaveBeenCalledWith(
      'photo-a',
      'pairs/pair-a/recipes/recipe-a/a.webp',
    )
    expect(screen.getByRole('button', { name: 'Remover garantia offline' })).toBeInTheDocument()
  })

  it('keeps a partial guarantee visible and reconciles when a later sync arrives', async () => {
    setOnline(true)
    const user = userEvent.setup()
    const media = [{ id: 'photo-a', storage_path: 'pairs/pair-a/recipes/recipe-a/a.webp' }]
    const { database, notifyCrud } = createDatabase(media)
    let fail = true
    const cached = new Set<string>()
    const runtime = {
      hasCachedBlob: vi.fn(async (id: string) => cached.has(id)),
      resolveBlob: vi.fn(async (id: string) => {
        if (fail) throw new Error('offline')
        cached.add(id)
        return new Blob(['image'])
      }),
    }

    render(
      <OfflineRecipeAvailability
        database={database}
        pairId="pair-a"
        recipeId="recipe-a"
        runtime={runtime as never}
      />,
    )

    await user.click(await screen.findByRole('button', { name: 'Disponibilizar offline' }))
    expect(await screen.findByText(/1 ainda precisam ser baixadas/)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/Parte das fotos/)

    fail = false
    notifyCrud()
    await waitFor(() => {
      expect(screen.getByText('1 de 1 fotos estão disponíveis neste dispositivo.')).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  it('retries a pinned recipe automatically when the browser comes back online', async () => {
    setOnline(false)
    const user = userEvent.setup()
    const media = [{ id: 'photo-a', storage_path: 'pairs/pair-a/recipes/recipe-a/a.webp' }]
    const { database } = createDatabase(media)
    const cached = new Set<string>()
    const runtime = {
      hasCachedBlob: vi.fn(async (id: string) => cached.has(id)),
      resolveBlob: vi.fn(async (id: string) => {
        cached.add(id)
        return new Blob(['image'])
      }),
    }

    render(
      <OfflineRecipeAvailability
        database={database}
        pairId="pair-a"
        recipeId="recipe-a"
        runtime={runtime as never}
      />,
    )

    await user.click(await screen.findByRole('button', { name: 'Disponibilizar offline' }))
    expect(await screen.findByText(/1 ainda precisam ser baixadas/)).toBeInTheDocument()

    setOnline(true)
    window.dispatchEvent(new Event('online'))

    await waitFor(() => {
      expect(screen.getByText('1 de 1 fotos estão disponíveis neste dispositivo.')).toBeInTheDocument()
    })
    expect(runtime.resolveBlob).toHaveBeenCalledWith('photo-a', media[0].storage_path)
  })

  it('removes only the device guarantee when disabled', async () => {
    setOnline(true)
    const user = userEvent.setup()
    const { database } = createDatabase()
    const runtime = {
      hasCachedBlob: vi.fn(async () => false),
      resolveBlob: vi.fn(),
    }

    render(
      <OfflineRecipeAvailability
        database={database}
        pairId="pair-a"
        recipeId="recipe-a"
        runtime={runtime as never}
      />,
    )

    await user.click(await screen.findByRole('button', { name: 'Disponibilizar offline' }))
    await user.click(await screen.findByRole('button', { name: 'Remover garantia offline' }))

    expect(await screen.findByRole('button', { name: 'Disponibilizar offline' })).toBeInTheDocument()
    expect(runtime.resolveBlob).not.toHaveBeenCalled()
  })
})
