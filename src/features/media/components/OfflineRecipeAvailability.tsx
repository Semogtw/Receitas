import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  const reconcilingRef = useRef(false)
  const reconcileAgainRef = useRef(false)
  const manualOperationRef = useRef(false)

  const reconcile = useCallback(async () => {
    if (manualOperationRef.current) {
      reconcileAgainRef.current = true
      return
    }
    if (reconcilingRef.current) {
      reconcileAgainRef.current = true
      return
    }

    reconcilingRef.current = true
    try {
      do {
        reconcileAgainRef.current = false
        const result = navigator.onLine
          ? await manager.reconcile(recipeId)
          : await manager.inspect(recipeId)
        setStatus(result)
        if ('failed' in result && result.failed > 0) {
          setError('Parte das fotos ainda não pôde ser baixada. O app tentará novamente quando a conexão ou os dados mudarem.')
        }
      } while (reconcileAgainRef.current && !manualOperationRef.current)
    } catch {
      setError('Não foi possível verificar a disponibilidade offline desta receita.')
    } finally {
      reconcilingRef.current = false
    }
  }, [manager, recipeId])

  useEffect(() => {
    void reconcile()
  }, [reconcile])

  useEffect(() => {
    const listener = database.registerListener({
      crudUpdate: () => void reconcile(),
    } as Parameters<PowerSyncDatabase['registerListener']>[0]) as unknown
    const onOnline = () => void reconcile()
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('online', onOnline)
      if (typeof listener === 'function') listener()
    }
  }, [database, reconcile])

  async function enable(): Promise<void> {
    setBusy(true)
    setError(null)
    manualOperationRef.current = true
    try {
      const result = await manager.prepare(recipeId)
      setStatus(result)
      if (result.failed > 0) {
        setError('Parte das fotos não pôde ser baixada agora. O app mantém a preferência e você pode tentar novamente quando estiver online.')
      }
    } catch {
      setError('Não foi possível preparar esta receita para uso offline.')
    } finally {
      manualOperationRef.current = false
      setBusy(false)
      if (reconcileAgainRef.current) void reconcile()
    }
  }

  async function disable(): Promise<void> {
    setBusy(true)
    setError(null)
    manualOperationRef.current = true
    try {
      await manager.setEnabled(recipeId, false)
      setStatus(await manager.inspect(recipeId))
    } catch {
      setError('Não foi possível alterar a preferência offline neste dispositivo.')
    } finally {
      manualOperationRef.current = false
      setBusy(false)
      if (reconcileAgainRef.current) void reconcile()
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
