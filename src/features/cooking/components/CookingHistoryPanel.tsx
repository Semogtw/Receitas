import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PowerSyncDatabase } from '@powersync/web'
import { CookingRepository } from '../data/cooking-repository'
import type { CookingSessionSummary } from '../domain/cooking-session'
import { CookingHistory } from './CookingHistory'
import { RatingForm, type RatingFormValue } from './RatingForm'

interface CookingHistoryPanelProps {
  database: PowerSyncDatabase
  pairId: string
  actorUserId: string
  recipeId: string
}

function preparedAtLabel(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function CookingHistoryPanel({ database, pairId, actorUserId, recipeId }: CookingHistoryPanelProps) {
  const repository = useMemo(
    () => new CookingRepository(database, { pairId, actorUserId }),
    [actorUserId, database, pairId],
  )
  const [sessions, setSessions] = useState<CookingSessionSummary[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const next = await repository.listRecipeHistory(recipeId)
      setSessions(next)
      setSelectedSessionId((current) => {
        if (current && next.some((session) => session.id === current)) return current
        return next[0]?.id ?? null
      })
      setError(null)
    } catch {
      setError('Não foi possível atualizar o histórico de preparos.')
    } finally {
      setLoading(false)
    }
  }, [recipeId, repository])

  useEffect(() => {
    setLoading(true)
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

  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? null
  const myRating = selectedSession?.ratings.find((rating) => rating.userId === actorUserId) ?? null

  async function saveMyRating(value: RatingFormValue): Promise<void> {
    if (!selectedSession) return
    await repository.setMyRating(selectedSession.id, value.score, value.comment)
    await refresh()
  }

  return (
    <div className="cooking-history-panel">
      {loading ? <p role="status">Carregando histórico de preparos…</p> : null}
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      {!loading ? <CookingHistory sessions={sessions} currentUserId={actorUserId} /> : null}

      {sessions.length > 0 && selectedSession ? (
        <details className="cooking-history-panel__rating-editor">
          <summary>Editar minha avaliação</summary>
          {sessions.length > 1 ? (
            <label className="cooking-history-panel__session-select">
              <span>Preparo para avaliar</span>
              <select
                aria-label="Preparo para avaliar"
                value={selectedSession.id}
                onChange={(event) => setSelectedSessionId(event.currentTarget.value)}
              >
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>{preparedAtLabel(session.preparedAt)}</option>
                ))}
              </select>
            </label>
          ) : null}
          <RatingForm
            key={`${selectedSession.id}:${myRating?.updatedAt ?? 'new'}`}
            initial={myRating ? { score: myRating.score, comment: myRating.comment } : null}
            onSave={saveMyRating}
          />
        </details>
      ) : null}
    </div>
  )
}
