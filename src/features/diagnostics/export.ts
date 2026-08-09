import type { PowerSyncDatabase } from '@powersync/web'
import { MediaUploadQueueStore } from '../media/data/media-upload-queue'
import type { DiagnosticEvent } from './events'
import { DiagnosticStore } from './store'

export interface DiagnosticsExportPayload {
  format: 'receitas-diagnostics'
  version: 1
  generatedAt: string
  appVersion: string
  runtime: {
    browserFamily: 'chrome' | 'edge' | 'firefox' | 'safari' | 'other' | 'unknown'
    platformFamily: 'android' | 'ios' | 'windows' | 'macos' | 'linux' | 'other' | 'unknown'
    online: boolean | null
    serviceWorkerState: 'controlled' | 'uncontrolled' | 'unsupported' | 'unknown'
  }
  sync: {
    pendingMutations: number
    pendingMedia: number
    openConflicts: number
  }
  verbose: {
    enabled: boolean
    until: string | null
  }
  events: DiagnosticEvent[]
}

export interface DiagnosticsArtifact {
  filename: string
  bytes: number
  file: File
  payload: DiagnosticsExportPayload
}

function browserFamily(userAgent: string): DiagnosticsExportPayload['runtime']['browserFamily'] {
  const ua = userAgent.toLocaleLowerCase('en-US')
  if (!ua) return 'unknown'
  if (/edg\//.test(ua)) return 'edge'
  if (/firefox\//.test(ua)) return 'firefox'
  if (/chrome\//.test(ua) || /crios\//.test(ua)) return 'chrome'
  if (/safari\//.test(ua) && !/chrome\//.test(ua) && !/crios\//.test(ua)) return 'safari'
  return 'other'
}

function platformFamily(userAgent: string): DiagnosticsExportPayload['runtime']['platformFamily'] {
  const ua = userAgent.toLocaleLowerCase('en-US')
  if (!ua) return 'unknown'
  if (/android/.test(ua)) return 'android'
  if (/iphone|ipad|ipod/.test(ua)) return 'ios'
  if (/windows/.test(ua)) return 'windows'
  if (/macintosh|mac os x/.test(ua)) return 'macos'
  if (/linux/.test(ua)) return 'linux'
  return 'other'
}

function runtimeSummary(): DiagnosticsExportPayload['runtime'] {
  if (typeof navigator === 'undefined') {
    return {
      browserFamily: 'unknown',
      platformFamily: 'unknown',
      online: null,
      serviceWorkerState: 'unknown',
    }
  }
  const serviceWorkerState = !('serviceWorker' in navigator)
    ? 'unsupported' as const
    : navigator.serviceWorker.controller
      ? 'controlled' as const
      : 'uncontrolled' as const
  return {
    browserFamily: browserFamily(navigator.userAgent ?? ''),
    platformFamily: platformFamily(navigator.userAgent ?? ''),
    online: typeof navigator.onLine === 'boolean' ? navigator.onLine : null,
    serviceWorkerState,
  }
}

async function count(
  database: PowerSyncDatabase,
  sql: string,
  params: unknown[],
): Promise<number> {
  const row = await database.getOptional<{ count: number }>(sql, params)
  const value = Number(row?.count ?? 0)
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Diagnostic count query returned an invalid value')
  return value
}

export async function collectDiagnostics(input: {
  database: PowerSyncDatabase
  pairId: string
  appVersion: string
  store?: DiagnosticStore
  generatedAt?: string
}): Promise<DiagnosticsExportPayload> {
  const store = input.store ?? new DiagnosticStore(input.database)
  const generatedAt = input.generatedAt ?? new Date().toISOString()
  const parsed = Date.parse(generatedAt)
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== generatedAt) {
    throw new Error('Diagnostics generatedAt must be normalized ISO')
  }

  const [pendingMutations, openConflicts, mediaJobs, events, verboseUntil] = await Promise.all([
    count(input.database, 'SELECT COUNT(*) AS count FROM mutation_outbox WHERE pair_id = ?', [input.pairId]),
    count(input.database, "SELECT COUNT(*) AS count FROM conflicts WHERE pair_id = ? AND status = 'open'", [input.pairId]),
    new MediaUploadQueueStore(input.database).load(),
    store.list(),
    store.verboseUntil(),
  ])

  return {
    format: 'receitas-diagnostics',
    version: 1,
    generatedAt,
    appVersion: input.appVersion.trim() || 'unknown',
    runtime: runtimeSummary(),
    sync: {
      pendingMutations,
      pendingMedia: mediaJobs.filter((job) => job.pairId === input.pairId).length,
      openConflicts,
    },
    verbose: {
      enabled: verboseUntil !== null,
      until: verboseUntil,
    },
    events,
  }
}

export async function createDiagnosticsArtifact(input: {
  database: PowerSyncDatabase
  pairId: string
  appVersion: string
  store?: DiagnosticStore
  generatedAt?: string
}): Promise<DiagnosticsArtifact> {
  const payload = await collectDiagnostics(input)
  const serialized = `${JSON.stringify(payload, null, 2)}\n`
  const filename = `receitas-diagnostics-${payload.generatedAt.replace(/[:.]/g, '-')}.json`
  const file = new File([serialized], filename, { type: 'application/json' })
  return { filename, bytes: file.size, file, payload }
}
