import type { PowerSyncDatabase } from '@powersync/web'
import { describe, expect, it, vi } from 'vitest'
import { createDiagnosticsArtifact } from './export'
import { DiagnosticStore } from './store'

const pairId = '20000000-0000-4000-8000-000000000002'

function fakeDatabase() {
  const preferences = new Map<string, string>()
  const database = {
    getOptional: vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('mutation_outbox')) return { count: 2 }
      if (sql.includes('FROM conflicts')) return { count: 1 }
      if (sql.includes('device_preferences')) {
        const value = preferences.get(String(params?.[0] ?? ''))
        return value === undefined ? null : { value_json: value }
      }
      return null
    }),
    execute: vi.fn(async (_sql: string, params?: unknown[]) => {
      preferences.set(String(params?.[0] ?? ''), String(params?.[1] ?? 'null'))
    }),
  } as unknown as PowerSyncDatabase
  return { database, preferences }
}

describe('diagnostics export', () => {
  it('exports counts and sanitized events without pair/user ids or recipe content', async () => {
    const fake = fakeDatabase()
    fake.preferences.set('media_upload_queue_v1', JSON.stringify([{
      version: 1,
      id: 'photo-private-id',
      pairId,
      ownerType: 'recipe',
      ownerId: 'recipe-private-id',
      mimeType: 'image/webp',
      extension: 'webp',
      width: 800,
      height: 600,
      sizeBytes: 123,
      position: 0,
      caption: null,
      createdAt: '2026-08-09T10:00:00.000Z',
      state: 'pending',
      attempts: 0,
      lastError: null,
    }]))
    const store = new DiagnosticStore(fake.database)
    await store.append({
      area: 'import',
      severity: 'error',
      code: 'parse_failed',
      technicalContext: {
        errorCode: 'invalid_schema',
        recipeText: 'Receita super secreta',
        email: 'person@example.com',
        pairId,
      },
    })

    const artifact = await createDiagnosticsArtifact({
      database: fake.database,
      pairId,
      appVersion: '1.2.3',
      store,
      generatedAt: '2026-08-09T11:00:00.000Z',
    })
    const serialized = await artifact.file.text()

    expect(artifact.payload.sync).toEqual({ pendingMutations: 2, pendingMedia: 1, openConflicts: 1 })
    expect(artifact.payload.events[0]?.technicalContext).toEqual({ errorCode: 'invalid_schema' })
    expect(serialized).not.toContain(pairId)
    expect(serialized).not.toContain('photo-private-id')
    expect(serialized).not.toContain('recipe-private-id')
    expect(serialized).not.toContain('Receita super secreta')
    expect(serialized).not.toContain('person@example.com')
  })

  it('exports only coarse browser/platform families rather than the raw user agent', async () => {
    const fake = fakeDatabase()
    const artifact = await createDiagnosticsArtifact({
      database: fake.database,
      pairId,
      appVersion: '1.2.3',
      generatedAt: '2026-08-09T11:00:00.000Z',
    })
    const serialized = await artifact.file.text()

    expect(serialized).toContain('browserFamily')
    expect(serialized).toContain('platformFamily')
    expect(serialized).not.toContain(navigator.userAgent)
  })
})
