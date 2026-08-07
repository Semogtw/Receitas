import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { PowerSyncDatabase } from '@powersync/web'
import { useAuth } from '../features/auth/AuthProvider'
import { getDatabase } from './database'

const PowerSyncContext = createContext<PowerSyncDatabase | null>(null)

export function PowerSyncProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const database = useMemo(() => {
    if (auth.status !== 'ready' || !auth.userId || !auth.pairId) return null
    return getDatabase({ userId: auth.userId, pairId: auth.pairId })
  }, [auth.status, auth.userId, auth.pairId])

  return <PowerSyncContext.Provider value={database}>{children}</PowerSyncContext.Provider>
}

export function usePowerSyncDatabase(): PowerSyncDatabase {
  const database = useContext(PowerSyncContext)
  if (!database) throw new Error('PowerSync database is unavailable before an authorized pair scope is ready')
  return database
}

export function useOptionalPowerSyncDatabase(): PowerSyncDatabase | null {
  return useContext(PowerSyncContext)
}
