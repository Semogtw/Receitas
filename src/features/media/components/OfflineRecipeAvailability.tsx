import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PowerSyncDatabase } from '@powersync/web'
import { OfflineRecipeMediaManager, type OfflineRecipeMediaStatus } from '../data/offline-recipe-media'
import type { MediaRuntime } from '../media-runtime'

interface OfflineRecipeAvailabilityProps {
  database: PowerSyncDatabase
  pairId: string
  recipeId: string
  runtime: MediaRuntime
}

const EMPTY_STATUS: OfflineRecipeMediaStatus = {
  enabled: false,
  total: 0,
  cached: 0,
  missing: 0,
  state: 'disabled',
}

function statusText(status: OfflineRecipeMediaStatus): string {
  if (!status.enabled) return 'As fotos são baixadas quando abertas e podem ser removidas pelo navegador quando precisar de espaço.'
  if (status.state === 'available') {
    return status.total === 0
      ? 'Esta receita está marcada para uso offline. Não há fotos remotas para baixar agora.'
      : `${status.cached} de ${status.total} fotos estão disponíveis neste dispositivo.`
  }
  return `${status.cached} de ${status.total} fotos estão neste dispositivo; ${status.missing} ainda precisam ser baixadas.`
}

export function OfflineRecipeAvailability({ database, pairId, recipeId, runtime }: OfflineRecipeAvailabilityProps) {
  const manager = useMemo(
    () => new OfflineRecipeMediaManager(database, runtime, pairId),
    [database, pairId, runtime],
  )
  const [status, setStatus] = useState<OfflineRecipeMediaStatus>(EMPTY_STATUS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setStatus(await manager.inspect(recipeId))
    } catch {
      setError('Não foi possível verificar a disponibilidade offline desta receita.')
    }
  }, [manager, recipeId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const listener = database.registerListener({
      crudUpdate: () => void refresh(),
    } as Parameters<PowerSyncDatabase['registerListener']>[0]) as unknown
    return () => {
      if (typeof listener === 'function') listener()
    }
  }, [database, refresh])

  async function enable(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const result = await manager.prepare(recipeId)
      setStatus(result)
      if (result.failed > 0) {
        setError('Parte das fotos não pôde ser baixada agora. O app mantém a preferência e você pode tentar novamente quando estiver online.')
      }
    } catch {
      setError('Não foi possível preparar esta receita para uso offline.')
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function disable(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await manager.setEnabled(recipeId, false)
      await refresh()
    } catch {
      setError('Não foi possível alterar a preferência offline neste dispositivo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="offline-recipe" aria-labelledby="offline-recipe-title">
      <div className="offline-recipe__content">
        <p className="route-kicker">Neste dispositivo</p>
        <h2 id="offline-recipe-title">Disponibilidade offline</h2>
        <p>{statusText(status)}</p>
      </div>
      <div className="offline-recipe__actions">
        {!status.enabled ? (
          <button type="button" className="button button--quiet" disabled={busy} onClick={() => void enable()}>
            {busy ? 'Preparando…' : 'Disponibilizar offline'}
          </button>
        ) : (
          <>
            {status.missing > 0 ? (
              <button type="button" className="button button--quiet" disabled={busy} onClick={() => void enable()}>
                {busy ? 'Baixando…' : 'Tentar baixar novamente'}
              </button>
            ) : null}
            <button type="button" className="button button--quiet" disabled={busy} onClick={() => void disable()}>
              Remover garantia offline
            </button>
          </>
        )}
      </div>
      {error ? <p className="auth-error offline-recipe__error" role="alert">{error}</p> : null}
    </section>
  )
}
