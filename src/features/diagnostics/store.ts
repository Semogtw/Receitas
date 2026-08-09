import type { PowerSyncDatabase } from '@powersync/web'
import { createDiagnosticEvent, isDiagnosticEvent, type DiagnosticEvent, type DiagnosticEventInput } from './events'

const DIAGNOSTIC_EVENTS_KEY = 'diagnostic_events_v1'
const DIAGNOSTIC_VERBOSE_UNTIL_KEY = 'diagnostic_verbose_until_v1'
export const MAX_DIAGNOSTIC_EVENTS = 200
export const MAX_DIAGNOSTIC_BYTES = 128 * 1024
export const MAX_VERBOSE_DURATION_MS = 30 * 60 * 1000

interface PreferenceRow {
  value_json: string
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function parseEvents(value: string): DiagnosticEvent[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter(isDiagnosticEvent)
}

function compactEvents(events: readonly DiagnosticEvent[]): DiagnosticEvent[] {
  let compacted = events.slice(-MAX_DIAGNOSTIC_EVENTS)
  while (compacted.length > 0 && byteLength(JSON.stringify(compacted)) > MAX_DIAGNOSTIC_BYTES) {
    compacted = compacted.slice(1)
  }
  return compacted
}

function parseVerboseUntil(value: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return null
  }
  if (typeof parsed !== 'string') return null
  const millis = Date.parse(parsed)
  if (!Number.isFinite(millis) || new Date(millis).toISOString() !== parsed) return null
  return parsed
}

export class DiagnosticStore {
  constructor(private readonly database: PowerSyncDatabase) {}

  private async preference(id: string): Promise<string | null> {
    const row = await this.database.getOptional<PreferenceRow>(
      'SELECT value_json FROM device_preferences WHERE id = ? LIMIT 1',
      [id],
    )
    return row?.value_json ?? null
  }

  private async persist(id: string, value: unknown): Promise<void> {
    const now = new Date().toISOString()
    await this.database.execute(
      `INSERT INTO device_preferences (id, value_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         value_json = excluded.value_json,
         updated_at = excluded.updated_at`,
      [id, JSON.stringify(value), now],
    )
  }

  async list(): Promise<DiagnosticEvent[]> {
    const raw = await this.preference(DIAGNOSTIC_EVENTS_KEY)
    if (!raw) return []
    const events = compactEvents(parseEvents(raw))
    if (JSON.stringify(events) !== raw) await this.persist(DIAGNOSTIC_EVENTS_KEY, events)
    return events.map((event) => ({ ...event, technicalContext: { ...event.technicalContext } }))
  }

  async append(input: DiagnosticEventInput): Promise<DiagnosticEvent> {
    const event = createDiagnosticEvent(input)
    const events = compactEvents([...(await this.list()), event])
    await this.persist(DIAGNOSTIC_EVENTS_KEY, events)
    return event
  }

  async clear(): Promise<void> {
    await this.persist(DIAGNOSTIC_EVENTS_KEY, [])
  }

  async verboseUntil(now = new Date()): Promise<string | null> {
    const raw = await this.preference(DIAGNOSTIC_VERBOSE_UNTIL_KEY)
    if (!raw) return null
    const value = parseVerboseUntil(raw)
    if (!value || Date.parse(value) <= now.getTime()) {
      await this.persist(DIAGNOSTIC_VERBOSE_UNTIL_KEY, null)
      return null
    }
    return value
  }

  async isVerbose(now = new Date()): Promise<boolean> {
    return (await this.verboseUntil(now)) !== null
  }

  async enableVerbose(durationMs = 15 * 60 * 1000, now = new Date()): Promise<string> {
    if (!Number.isSafeInteger(durationMs) || durationMs <= 0 || durationMs > MAX_VERBOSE_DURATION_MS) {
      throw new Error('Diagnostic verbose duration is out of bounds')
    }
    const until = new Date(now.getTime() + durationMs).toISOString()
    await this.persist(DIAGNOSTIC_VERBOSE_UNTIL_KEY, until)
    return until
  }

  async disableVerbose(): Promise<void> {
    await this.persist(DIAGNOSTIC_VERBOSE_UNTIL_KEY, null)
  }
}
