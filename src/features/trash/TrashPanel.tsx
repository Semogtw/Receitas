import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PowerSyncDatabase } from '@powersync/web'
import { TrashRepository, type TrashEntry } from './trash-repository'

interface TrashPanelProps {
  database: PowerSyncDatabase
  pairId: string
  actorUserId: string
  repository?: TrashRepository
}

const ENTITY_LABELS: Record<string, string> = {
  recipes: 'Receita',
  recipe_ingredients: 'Ingrediente',
  recipe_steps: 'Etapa',
  categories: 'Categoria',
  recipe_categories: 'Categoria da receita',
  recipe_photos: 'Foto da receita',
  cooking_sessions: 'Preparo',
  cooking_session_ratings: 'Avaliação',
  cooking_session_photos: 'Foto do preparo',
  ingredient_conversion_profiles: 'Conversão de ingrediente',
  imports: 'Importação',
  meal_periods: 'Período de refeição',
  meal_plan_entries: 'Refeição planejada',
  shopping_lists: 'Lista de compras',
  shopping_items: 'Item de compras',
}

function formatDeletedAt(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function TrashPanel({ database, pairId, actorUserId, repository }: TrashPanelProps) {
  const trash = useMemo(
    () => repository ?? new TrashRepository(database, { pairId, actorUserId }),
    [actorUserId, database, pairId, repository],
  )
  const [entries, setEntries] = useState<TrashEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<TrashEntry | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setEntries(await trash.listTrash())
      setError(null)
    } catch {
      setError('Não foi possível carregar a lixeira deste dispositivo.')
    } finally {
      setLoading(false)
    }
  }, [trash])

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

  async function restore(entry: TrashEntry): Promise<void> {
    const key = `${entry.entityType}:${entry.entityId}`
    setBusyKey(key)
    setError(null)
    setMessage(null)
    try {
      await trash.restore(entry.entityType, entry.entityId)
      setMessage('Item restaurado. A alteração seguirá o fluxo normal de sincronização.')
      await refresh()
    } catch {
      setError('Não foi possível restaurar este item agora.')
    } finally {
      setBusyKey(null)
    }
  }

  async function permanentlyDelete(entry: TrashEntry): Promise<void> {
    const key = `${entry.entityType}:${entry.entityId}`
    setBusyKey(key)
    setError(null)
    setMessage(null)
    try {
      await trash.permanentlyDelete(entry.entityType, entry.entityId)
      setConfirming(null)
      setMessage('Exclusão definitiva concluída. Qualquer limpeza remota pendente continuará retryável pelo servidor.')
      await refresh()
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : ''
      if (text.includes('pending local mutation')) {
        setError('Este item ainda tem uma alteração local pendente. Aguarde a sincronização antes da exclusão definitiva.')
      } else {
        setError('Não foi possível excluir definitivamente este item.')
      }
    } finally {
      setBusyKey(null)
    }
  }

  async function retryCleanup(): Promise<void> {
    setBusyKey('cleanup')
    setError(null)
    setMessage(null)
    try {
      const result = await trash.retryPendingMediaCleanup()
      setMessage(result.cleanupPending
        ? 'Ainda há arquivos remotos aguardando nova tentativa de limpeza.'
        : 'A fila de limpeza remota não possui pendências conhecidas.')
    } catch {
      setError('Não foi possível repetir a limpeza remota agora.')
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <section className="trash-panel" aria-labelledby="trash-title">
      <div className="trash-panel__heading">
        <div>
          <p className="route-kicker">Recuperação</p>
          <h2 id="trash-title">Lixeira</h2>
          <p>Restaure itens removidos ou apague definitivamente somente depois que as alterações locais tiverem sincronizado.</p>
        </div>
        <button type="button" className="button button--quiet" disabled={busyKey !== null} onClick={() => void retryCleanup()}>
          {busyKey === 'cleanup' ? 'Limpando…' : 'Repetir limpeza de arquivos'}
        </button>
      </div>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      {message ? <p className="trash-panel__message" role="status">{message}</p> : null}
      {loading ? <p role="status">Carregando lixeira…</p> : null}
      {!loading && entries.length === 0 ? <p className="trash-panel__empty">A lixeira está vazia neste dispositivo.</p> : null}

      {entries.length > 0 ? (
        <ul className="trash-panel__list">
          {entries.map((entry) => {
            const key = `${entry.entityType}:${entry.entityId}`
            const busy = busyKey === key
            return (
              <li key={key} className="trash-panel__item">
                <div>
                  <strong>{entry.label}</strong>
                  <span>{ENTITY_LABELS[entry.entityType] ?? entry.entityType}</span>
                  <small>Removido em {formatDeletedAt(entry.deletedAt)}</small>
                </div>
                <div className="trash-panel__actions">
                  <button type="button" className="button button--quiet" disabled={busyKey !== null} onClick={() => void restore(entry)}>
                    {busy ? 'Processando…' : 'Restaurar'}
                  </button>
                  <button type="button" className="button button--danger" disabled={busyKey !== null} onClick={() => setConfirming(entry)}>
                    Excluir definitivamente
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}

      {confirming ? (
        <div className="recipe-delete-confirmation" role="dialog" aria-modal="true" aria-labelledby="trash-permanent-title">
          <div>
            <p className="route-kicker">Ação irreversível</p>
            <h3 id="trash-permanent-title">Excluir “{confirming.label}” definitivamente?</h3>
            <p>Depois da confirmação, os dados canônicos não poderão ser restaurados pela lixeira. Fotos associadas entram em limpeza remota coordenada pelo servidor.</p>
          </div>
          <div className="recipe-delete-confirmation__actions">
            <button type="button" className="button button--quiet" disabled={busyKey !== null} onClick={() => setConfirming(null)}>Cancelar</button>
            <button type="button" className="button button--danger" disabled={busyKey !== null} onClick={() => void permanentlyDelete(confirming)}>
              {busyKey ? 'Excluindo…' : 'Excluir definitivamente'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
