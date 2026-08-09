import type { PowerSyncDatabase } from '@powersync/web'
import { describe, expect, it, vi } from 'vitest'
import { DiagnosticStore, MAX_DIAGNOSTIC_BYTES, MAX_DIAGNOSTIC_EVENTS } from './store'

function fakeDatabase(initial: Record<string, unknown> = {}) {
  const preferences = new Map<string, string>(
    Object.entries(initial).map(([key, value]) => [key, JSON.stringify(value)]),
  )
  return {
    preferences,
    database: {
      getOptional: vi.fn(async (_sql: string, params?: unknown[]) => {
        const id = String(params?.[0] ?? '')
        const value = preferences.get(id)
        return value === undefined ? null : { value_json: value }
      }),
      execute: vi.fn(async (_sql: string, params?: unknown[]) => {
        const id = String(params?.[0] ?? '')
        const value = String(params?.[1] ?? 'null')
        preferences.set(id, value)
      }),
    } as unknown as PowerSyncDatabase,
  }
}

describe('DiagnosticStore', () => {
  it('keeps only the newest bounded events', async () => {
    const fake = fakeDatabase()
    const store = new DiagnosticStore(fake.database)

    for (let index = 0; index < MAX_DIAGNOSTIC_EVENTS + 12; index += 1) {
      await store.append({
        area: 'sync',
        severity: 'info',
        code: `event_${index}`,
        technicalContext: { queueCount: index },
      })
    }

    const events = await store.list()
    expect(events).toHaveLength(MAX_DIAGNOSTIC_EVENTS)
    expect(events[0]?.code).toBe('event_12')
    expect(events.at(-1)?.code).toBe(`event_${MAX_DIAGNOSTIC_EVENTS + 11}`)
  })

  it('rolls off oldest events to remain below the byte ceiling', async () => {
    const fake = fakeDatabase()
    const store = new DiagnosticStore(fake.database)

    for (let index = 0; index < 500; index += 1) {
      await store.append({
        area: 'backup',
        severity: 'warning',
        code: `large_${index}`,
        technicalContext: {
          phase: 'x'.repeat(160),
          errorCode: 'y'.repeat(160),
          operation: 'z'.repeat(160),
        },
      })
    }

    const events = await store.list()
    const encoded = new TextEncoder().encode(JSON.stringify(events))
    expect(encoded.byteLength).toBeLessThanOrEqual(MAX_DIAGNOSTIC_BYTES)
    expect(events.at(-1)?.code).toBe('large_499')
  })

  it('drops malformed persisted records instead of exporting them', async () => {
    const fake = fakeDatabase({
      diagnostic_events_v1: [
        {
          id: 'bad',
          timestamp: '2026-08-09T10:00:00.000Z',
          area: 'sync',
          code: 'bad',
          severity: 'info',
          technicalContext: { payload: 'private recipe text' },
        },
      ],
    })
    const store = new DiagnosticStore(fake.database)

    expect(await store.list()).toEqual([])
  })

  it('expires verbose mode automatically and never permits an unbounded duration', async () => {
    const fake = fakeDatabase()
    const store = new DiagnosticStore(fake.database)
    const now = new Date('2026-08-09T10:00:00.000Z')

    const until = await store.enableVerbose(15 * 60 * 1000, now)
    expect(until).toBe('2026-08-09T10:15:00.000Z')
    expect(await store.isVerbose(new Date('2026-08-09T10:14:59.000Z'))).toBe(true)
    expect(await store.isVerbose(new Date('2026-08-09T10:15:00.000Z'))).toBe(false)
    await expect(store.enableVerbose(31 * 60 * 1000, now)).rejects.toThrow('out of bounds')
  })

  it('can clear diagnostic history without affecting any synchronized table', async () => {
    const fake = fakeDatabase()
    const store = new DiagnosticStore(fake.database)
    await store.append({ area: 'pwa', severity: 'info', code: 'ready' })

    await store.clear()

    expect(await store.list()).toEqual([])
    expect(vi.mocked(fake.database.execute).mock.calls.every((call) => String(call[0]).includes('device_preferences'))).toBe(true)
  })
})
