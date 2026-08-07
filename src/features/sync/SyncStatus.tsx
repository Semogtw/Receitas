import { useSyncRuntime } from '../../data/sync/SyncRuntimeProvider'

interface SyncStatusProps {
  onOpenConflicts?: () => void
}

export function SyncStatus({ onOpenConflicts }: SyncStatusProps) {
  const sync = useSyncRuntime()

  if (sync.uiState === 'synced') return null

  return (
    <div className="sync-status" role={sync.uiState === 'error' ? 'alert' : 'status'} aria-live="polite">
      <span>{sync.label}</span>
      {sync.uiState === 'error' ? (
        <button type="button" className="button button--quiet" onClick={() => void sync.refresh()}>Tentar novamente</button>
      ) : null}
      {sync.uiState === 'conflict' && onOpenConflicts ? (
        <button type="button" className="button button--quiet" onClick={onOpenConflicts}>Resolver</button>
      ) : null}
    </div>
  )
}
