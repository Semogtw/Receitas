import { describe, expect, it, vi } from 'vitest'
import { OfflineRecipeMediaManager } from './offline-recipe-media'

function createDatabase(rows: Array<{ id: string; storage_path: string }> = []) {
  let preference: string | null = null
  const execute = vi.fn(async (sql: string, parameters: unknown[]) => {
    if (sql.includes('DELETE FROM device_preferences')) {
      preference = null
    } else if (sql.includes('INSERT INTO device_preferences')) {
      preference = String(parameters[1])
    }
    return { rowsAffected: 1 }
  })
  const getOptional = vi.fn(async () => preference ? { value_json: preference } : null)
  const getAll = vi.fn(async () => rows)
  return { database: { execute, getOptional, getAll } as never, execute, getOptional, getAll }
}

describe('OfflineRecipeMediaManager', () => {
  it('keeps the preference device-local and disabled by default', async () => {
    const { database, execute } = createDatabase()
    const runtime = { resolveBlob: vi.fn(), hasCachedBlob: vi.fn(async () => false) }
    const manager = new OfflineRecipeMediaManager(database, runtime as never, 'pair-a')

    expect(await manager.inspect('recipe-a')).toEqual({
      enabled: false,
      total: 0,
      cached: 0,
      missing: 0,
      state: 'disabled',
    })

    await manager.setEnabled('recipe-a', true)
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO device_preferences'),
      expect.arrayContaining(['offline_recipe_media:recipe-a']),
    )
    expect(await manager.isEnabled('recipe-a')).toBe(true)

    await manager.setEnabled('recipe-a', false)
    expect(await manager.isEnabled('recipe-a')).toBe(false)
  })

  it('downloads only missing media and reports available when the complete set is cached', async () => {
    const media = [
      { id: 'photo-a', storage_path: 'pairs/pair-a/recipes/recipe-a/a.webp' },
      { id: 'photo-b', storage_path: 'pairs/pair-a/cooking-sessions/session-a/b.webp' },
    ]
    const { database } = createDatabase(media)
    const cached = new Set(['photo-a'])
    const resolveBlob = vi.fn(async (id: string) => {
      cached.add(id)
      return new Blob(['image'])
    })
    const runtime = {
      resolveBlob,
      hasCachedBlob: vi.fn(async (id: string) => cached.has(id)),
    }
    const manager = new OfflineRecipeMediaManager(database, runtime as never, 'pair-a')

    const result = await manager.prepare('recipe-a')

    expect(resolveBlob).toHaveBeenCalledTimes(1)
    expect(resolveBlob).toHaveBeenCalledWith('photo-b', media[1].storage_path)
    expect(result).toMatchObject({ enabled: true, total: 2, cached: 2, missing: 0, failed: 0, state: 'available' })
  })

  it('keeps the offline preference enabled and reports partial when a remote download fails', async () => {
    const media = [
      { id: 'photo-a', storage_path: 'pairs/pair-a/recipes/recipe-a/a.webp' },
      { id: 'photo-b', storage_path: 'pairs/pair-a/recipes/recipe-a/b.webp' },
    ]
    const { database } = createDatabase(media)
    const cached = new Set<string>()
    const runtime = {
      hasCachedBlob: vi.fn(async (id: string) => cached.has(id)),
      resolveBlob: vi.fn(async (id: string) => {
        if (id === 'photo-b') throw new Error('offline')
        cached.add(id)
        return new Blob(['image'])
      }),
    }
    const manager = new OfflineRecipeMediaManager(database, runtime as never, 'pair-a')

    const result = await manager.prepare('recipe-a')

    expect(result).toMatchObject({ enabled: true, total: 2, cached: 1, missing: 1, failed: 1, state: 'partial' })
    expect(await manager.isEnabled('recipe-a')).toBe(true)
  })

  it('reconciles newly synced media without rewriting the device preference', async () => {
    const media: Array<{ id: string; storage_path: string }> = []
    const { database, execute } = createDatabase(media)
    const cached = new Set<string>()
    const runtime = {
      hasCachedBlob: vi.fn(async (id: string) => cached.has(id)),
      resolveBlob: vi.fn(async (id: string) => {
        cached.add(id)
        return new Blob(['image'])
      }),
    }
    const manager = new OfflineRecipeMediaManager(database, runtime as never, 'pair-a')

    await manager.setEnabled('recipe-a', true)
    execute.mockClear()
    media.push({ id: 'photo-new', storage_path: 'pairs/pair-a/recipes/recipe-a/new.webp' })

    const result = await manager.reconcile('recipe-a')

    expect(result).toMatchObject({ enabled: true, total: 1, cached: 1, missing: 0, failed: 0, state: 'available' })
    expect(runtime.resolveBlob).toHaveBeenCalledWith('photo-new', media[0].storage_path)
    expect(execute).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO device_preferences'),
      expect.anything(),
    )
  })

  it('does not download media while the recipe is not pinned on this device', async () => {
    const media = [{ id: 'photo-a', storage_path: 'pairs/pair-a/recipes/recipe-a/a.webp' }]
    const { database } = createDatabase(media)
    const runtime = {
      hasCachedBlob: vi.fn(async () => false),
      resolveBlob: vi.fn(),
    }
    const manager = new OfflineRecipeMediaManager(database, runtime as never, 'pair-a')

    const result = await manager.reconcile('recipe-a')

    expect(result).toMatchObject({ enabled: false, total: 1, cached: 0, missing: 1, failed: 0, state: 'disabled' })
    expect(runtime.resolveBlob).not.toHaveBeenCalled()
  })
})
