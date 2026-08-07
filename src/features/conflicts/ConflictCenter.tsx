import { useCallback, useEffect, useState } from 'react'
import { usePowerSyncDatabase } from '../../data/PowerSyncProvider'
import { parseConflict, type ConflictRecord, type ParsedConflict } from '../../data/conflicts/types'
import { useSyncRuntime } from '../../data/sync/SyncRuntimeProvider'
import { ConflictResolver } from './ConflictResolver'

export function ConflictCenter() {
  const database = usePowerSyncDatabase()
  const sync = useSyncRuntime()
  const [conflicts, setConflicts] = useState<ParsedConflict[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const rows = await database.getAll<ConflictRecord>(
        `SELECT id, pair_id, entity_type, entity_id, base_revision,
                base_payload, local_payload, remote_payload, status,
                resolution_strategy, resolution_payload, resolved_by,
                created_at, resolved_at
           FROM conflicts
          WHERE status = 'open'
          ORDER BY created_at ASC`,
      )
      setConflicts(rows.map(parseConflict))
      setError(null)
    } catch {
      setError('Não foi possível abrir os conflitos agora. As versões continuam preservadas.')
    }
  }, [database])

  useEffect(() => {
    void load()
  }, [load, sync.openConflictCount])

  async function refreshAfterChange() {
    await sync.refresh()
    await load()
  }

  return (
    <section className="conflict-center" aria-labelledby="conflicts-title">
      <h1 id="conflicts-title">Conflitos</h1>
      <p>Conflitos podem ser resolvidos depois. O restante do caderno continua disponível.</p>
      {error ? <p role="alert" className="auth-error">{error}</p> : null}
      {!error && conflicts.length === 0 ? <p>Nenhum conflito aguardando resolução.</p> : null}
      {conflicts.map((conflict) => (
        <ConflictResolver
          key={conflict.id}
          conflict={conflict}
          onResolved={refreshAfterChange}
          onRefreshed={refreshAfterChange}
        />
      ))}
    </section>
  )
}
