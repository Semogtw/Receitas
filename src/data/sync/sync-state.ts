export type SyncUiState = 'synced' | 'pending' | 'syncing' | 'error' | 'conflict'

export interface SyncRuntimeSnapshot {
  connected: boolean
  connecting: boolean
  uploading: boolean
  downloading: boolean
  pendingCount: number
  openConflictCount: number
  hasError: boolean
  lastSyncedAt: string | null
}

export function deriveSyncUiState(snapshot: SyncRuntimeSnapshot): SyncUiState {
  if (snapshot.openConflictCount > 0) return 'conflict'
  if (snapshot.hasError) return 'error'
  if (snapshot.connecting || snapshot.uploading || snapshot.downloading) return 'syncing'
  if (snapshot.pendingCount > 0) return 'pending'
  return 'synced'
}

export function syncStatusCopy(state: SyncUiState, pendingCount: number): string {
  switch (state) {
    case 'conflict': return 'Há alterações para resolver'
    case 'error': return 'Sincronização interrompida'
    case 'syncing': return 'Sincronizando…'
    case 'pending': return pendingCount === 1 ? '1 alteração aguardando' : `${pendingCount} alterações aguardando`
    case 'synced': return 'Sincronizado'
  }
}
