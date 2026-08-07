import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { PowerSyncDatabase } from '@powersync/web'
import { useAuth } from '../../features/auth/AuthProvider'
import { useOptionalPowerSyncDatabase } from '../PowerSyncProvider'
import { ReceitasPowerSyncConnector } from './PowerSyncConnector'
import { SYNC_QUEUE_CHANGED_EVENT } from './sync-events'
import { deriveSyncUiState, syncStatusCopy, type SyncRuntimeSnapshot, type SyncUiState } from './sync-state'

interface StatusLike {
  connected?: boolean
  connecting?: boolean
  lastSyncedAt?: Date | string | null
  uploadError?: unknown
  downloadError?: unknown
  dataFlowStatus?: {
    uploading?: boolean
    downloading?: boolean
  } | null
}

interface SyncRuntimeValue extends SyncRuntimeSnapshot {
  uiState: SyncUiState
  label: string
  refresh(): Promise<void>
}

const initialSnapshot: SyncRuntimeSnapshot = {
  connected: false,
  connecting: false,
  uploading: false,
  downloading: false,
  pendingCount: 0,
  openConflictCount: 0,
  hasError: false,
  lastSyncedAt: null,
}

const SyncRuntimeContext = createContext<SyncRuntimeValue | null>(null)

function normalizeStatus(status: StatusLike | null | undefined): Pick<SyncRuntimeSnapshot, 'connected' | 'connecting' | 'uploading' | 'downloading' | 'hasError' | 'lastSyncedAt'> {
  const rawDate = status?.lastSyncedAt
  return {
    connected: Boolean(status?.connected),
    connecting: Boolean(status?.connecting),
    uploading: Boolean(status?.dataFlowStatus?.uploading),
    downloading: Boolean(status?.dataFlowStatus?.downloading),
    hasError: Boolean(status?.uploadError || status?.downloadError),
    lastSyncedAt: rawDate instanceof Date ? rawDate.toISOString() : typeof rawDate === 'string' ? rawDate : null,
  }
}

async function countRows(database: PowerSyncDatabase, sql: string): Promise<number> {
  const row = await database.get<{ count: number }>(sql)
  return Number(row?.count ?? 0)
}

export function SyncRuntimeProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const database = useOptionalPowerSyncDatabase()
  const [snapshot, setSnapshot] = useState<SyncRuntimeSnapshot>(initialSnapshot)

  const refresh = useCallback(async () => {
    if (!database) {
      setSnapshot(initialSnapshot)
      return
    }

    const [pendingCount, openConflictCount] = await Promise.all([
      countRows(database, 'SELECT count(*) AS count FROM mutation_outbox'),
      countRows(database, "SELECT count(*) AS count FROM conflicts WHERE status = 'open'"),
    ])

    const normalized = normalizeStatus(database.currentStatus as unknown as StatusLike)
    setSnapshot({ ...normalized, pendingCount, openConflictCount })
  }, [database])

  useEffect(() => {
    if (!database || auth.status !== 'ready' || !auth.userId || !auth.pairId) {
      setSnapshot(initialSnapshot)
      return
    }

    const connector = new ReceitasPowerSyncConnector({ userId: auth.userId, pairId: auth.pairId })
    let active = true

    const refreshIfActive = () => {
      if (active) void refresh()
    }

    const listener = database.registerListener({
      statusChanged: refreshIfActive,
      crudUpdate: refreshIfActive,
    } as Parameters<PowerSyncDatabase['registerListener']>[0]) as unknown

    const connect = async () => {
      try {
        await database.connect(connector)
      } catch {
        if (active && typeof navigator !== 'undefined' && navigator.onLine) {
          setSnapshot((current) => ({ ...current, hasError: true, connecting: false }))
        }
      } finally {
        refreshIfActive()
      }
    }

    void connect()
    void refresh()

    const online = () => void connect()
    window.addEventListener('online', online)
    window.addEventListener('offline', refreshIfActive)
    window.addEventListener(SYNC_QUEUE_CHANGED_EVENT, refreshIfActive)
    const fallbackTimer = window.setInterval(refreshIfActive, 15_000)

    return () => {
      active = false
      window.removeEventListener('online', online)
      window.removeEventListener('offline', refreshIfActive)
      window.removeEventListener(SYNC_QUEUE_CHANGED_EVENT, refreshIfActive)
      window.clearInterval(fallbackTimer)
      if (typeof listener === 'function') listener()
      void database.disconnect()
    }
  }, [auth.status, auth.userId, auth.pairId, database, refresh])

  const value = useMemo<SyncRuntimeValue>(() => {
    const uiState = deriveSyncUiState(snapshot)
    return { ...snapshot, uiState, label: syncStatusCopy(uiState, snapshot.pendingCount), refresh }
  }, [snapshot, refresh])

  return <SyncRuntimeContext.Provider value={value}>{children}</SyncRuntimeContext.Provider>
}

export function useSyncRuntime(): SyncRuntimeValue {
  const value = useContext(SyncRuntimeContext)
  if (!value) throw new Error('useSyncRuntime must be used inside SyncRuntimeProvider')
  return value
}
