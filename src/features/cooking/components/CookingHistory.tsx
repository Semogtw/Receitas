import { formatAmount } from '../../recipes/domain/amount'
import type { CookingSessionSummary } from '../domain/cooking-session'

interface CookingHistoryProps {
  sessions: readonly CookingSessionSummary[]
  currentUserId: string
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatScore(score: number): string {
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(score)}/10`
}

export function CookingHistory({ sessions, currentUserId }: CookingHistoryProps) {
  if (sessions.length === 0) {
    return (
      <section className="cooking-history" aria-labelledby="cooking-history-title">
        <div>
          <p className="route-kicker">Histórico</p>
          <h2 id="cooking-history-title">Preparos anteriores</h2>
        </div>
        <p className="cooking-history__empty">Ainda não há preparos registrados para esta receita.</p>
      </section>
    )
  }

  return (
    <section className="cooking-history" aria-labelledby="cooking-history-title">
      <div>
        <p className="route-kicker">Histórico</p>
        <h2 id="cooking-history-title">Preparos anteriores</h2>
      </div>
      <div className="cooking-history__list">
        {sessions.map((session) => (
          <article key={session.id} className="cooking-history__entry">
            <header className="cooking-history__entry-header">
              <div>
                <h3>{formatDate(session.preparedAt)}</h3>
                <p>Snapshot: {session.snapshot.title} · revisão {session.snapshot.recipeRevision}</p>
              </div>
              <strong>{session.averageScore === null ? 'Sem avaliações ainda' : `Média ${formatScore(session.averageScore)}`}</strong>
            </header>

            {session.preparedYield ? (
              <p className="cooking-history__yield">
                Rendimento preparado: {formatAmount({ kind: 'numeric', value: session.preparedYield })}
                {session.snapshot.baseYieldUnit ? ` ${session.snapshot.baseYieldUnit}` : ''}
              </p>
            ) : null}

            {session.sharedObservation ? (
              <div className="cooking-history__shared-note">
                <strong>Observação compartilhada</strong>
                <p>{session.sharedObservation}</p>
              </div>
            ) : null}

            <div className="cooking-history__ratings" aria-label={`Avaliações do preparo de ${formatDate(session.preparedAt)}`}>
              {session.ratings.length === 0 ? (
                <p>Sem avaliações ainda</p>
              ) : session.ratings.map((rating) => (
                <div key={rating.id} className="cooking-history__rating">
                  <div className="cooking-history__rating-heading">
                    <strong>{rating.userId === currentUserId ? 'Minha avaliação' : 'Outra pessoa'}</strong>
                    <span>{formatScore(rating.score)}</span>
                  </div>
                  {rating.comment ? <p>{rating.comment}</p> : <p className="cooking-history__muted">Sem comentário pessoal.</p>}
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
