import { useEffect, useMemo, useState } from 'react'
import type { PowerSyncDatabase } from '@powersync/web'
import type { RecipeAggregate } from '../../recipes/data/recipe-repository'
import { multiplyRational } from '../../recipes/domain/amount'
import { createCookingDraft, type CookingDraft } from '../domain/cooking-draft'
import type { CookingSessionSummary } from '../domain/cooking-session'
import { CookingRepository } from '../data/cooking-repository'
import { finalizeCookingDraft } from '../data/finalize-cooking-draft'
import { LocalCookingDraftStore } from '../data/local-cooking-draft-store'
import { CookingHistory } from './CookingHistory'
import { CookingMode } from './CookingMode'
import { FinishCooking, type FinishCookingValue } from './FinishCooking'
import { RatingForm, type RatingFormValue } from './RatingForm'

interface CookingWorkspaceProps {
  database: PowerSyncDatabase
  pairId: string
  actorUserId: string
  recipe: RecipeAggregate
  onExit(): void
}

type WorkspaceStage = 'loading' | 'conflict' | 'cooking' | 'finish' | 'finished'

export function CookingWorkspace({ database, pairId, actorUserId, recipe, onExit }: CookingWorkspaceProps) {
  const store = useMemo(() => new LocalCookingDraftStore(database), [database])
  const sessions = useMemo(
    () => new CookingRepository(database, { pairId, actorUserId }),
    [actorUserId, database, pairId],
  )
  const freshDraft = useMemo(
    () => createCookingDraft(recipe),
    [recipe.id, recipe.revision],
  )

  const [stage, setStage] = useState<WorkspaceStage>('loading')
  const [draft, setDraft] = useState<CookingDraft | null>(null)
  const [conflictingDraft, setConflictingDraft] = useState<CookingDraft | null>(null)
  const [history, setHistory] = useState<CookingSessionSummary[]>([])
  const [finishedSessionId, setFinishedSessionId] = useState<string | null>(null)
  const [ratingSaved, setRatingSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const restore = async () => {
      try {
        const existing = await store.load()
        if (!active) return

        if (!existing) {
          await store.save(freshDraft)
          if (!active) return
          setDraft(freshDraft)
          setStage('cooking')
          return
        }

        if (existing.recipeSnapshot.recipeId === recipe.id) {
          setDraft(existing)
          setStage('cooking')
          return
        }

        setConflictingDraft(existing)
        setStage('conflict')
      } catch (cause) {
        if (!active) return
        setError(cause instanceof Error ? cause.message : 'Não foi possível restaurar o preparo local.')
      }
    }

    void restore()
    return () => { active = false }
  }, [freshDraft, recipe.id, store])

  async function persistDraft(next: CookingDraft): Promise<void> {
    setError(null)
    try {
      await store.save(next)
      setDraft(next)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o andamento neste dispositivo.')
    }
  }

  async function replaceConflictingDraft(): Promise<void> {
    setError(null)
    try {
      await store.save(freshDraft)
      setConflictingDraft(null)
      setDraft(freshDraft)
      setStage('cooking')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível substituir o preparo local.')
    }
  }

  async function finish(value: FinishCookingValue): Promise<void> {
    if (!draft) return
    setError(null)
    const finishingDraft = draft
    try {
      const sessionId = await finalizeCookingDraft(finishingDraft, sessions, store, value)
      const nextHistory = await sessions.listRecipeHistory(finishingDraft.recipeSnapshot.recipeId)
      setHistory(nextHistory)
      setFinishedSessionId(sessionId)
      setDraft(null)
      setRatingSaved(false)
      setStage('finished')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível finalizar o preparo.')
      throw cause
    }
  }

  async function saveRating(value: RatingFormValue): Promise<void> {
    if (!finishedSessionId) return
    setError(null)
    try {
      await sessions.setMyRating(finishedSessionId, value.score, value.comment)
      const recipeId = history[0]?.recipeId ?? recipe.id
      setHistory(await sessions.listRecipeHistory(recipeId))
      setRatingSaved(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar sua avaliação.')
      throw cause
    }
  }

  if (stage === 'loading') {
    return <p role="status">Restaurando preparo neste dispositivo…</p>
  }

  if (stage === 'conflict' && conflictingDraft) {
    return (
      <section className="cooking-draft-conflict" aria-labelledby="cooking-draft-conflict-title">
        <p className="route-kicker">Preparo em andamento</p>
        <h1 id="cooking-draft-conflict-title">Já existe um preparo neste dispositivo</h1>
        <p>
          “{conflictingDraft.recipeSnapshot.title}” ainda tem um rascunho local. Escolha explicitamente se quer retomá-lo ou substituí-lo por “{recipe.title}”.
        </p>
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <div className="cooking-draft-conflict__actions">
          <button
            type="button"
            className="button button--quiet"
            onClick={() => {
              setDraft(conflictingDraft)
              setConflictingDraft(null)
              setStage('cooking')
            }}
          >Continuar {conflictingDraft.recipeSnapshot.title}</button>
          <button type="button" className="button button--primary" onClick={() => void replaceConflictingDraft()}>
            Substituir por {recipe.title}
          </button>
          <button type="button" className="button button--quiet" onClick={onExit}>Voltar à receita</button>
        </div>
      </section>
    )
  }

  if (stage === 'cooking' && draft) {
    return (
      <section className="cooking-workspace">
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <CookingMode
          draft={draft}
          onDraftChange={persistDraft}
          onFinish={() => setStage('finish')}
          onExit={onExit}
        />
      </section>
    )
  }

  if (stage === 'finish' && draft) {
    const preparedYield = draft.recipeSnapshot.baseYield
      ? multiplyRational(draft.recipeSnapshot.baseYield, draft.servingMultiplier)
      : null
    return (
      <section className="cooking-workspace cooking-workspace--finish">
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <FinishCooking
          baseYield={preparedYield}
          baseYieldUnit={draft.recipeSnapshot.baseYieldUnit}
          onFinish={finish}
          onCancel={() => setStage('cooking')}
        />
      </section>
    )
  }

  if (stage === 'finished') {
    return (
      <section className="cooking-workspace cooking-workspace--finished">
        <header>
          <p className="route-kicker">Preparo registrado</p>
          <h1>Histórico atualizado</h1>
          <p>O registro foi salvo localmente e seguirá o fluxo normal de sincronização.</p>
        </header>
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        {ratingSaved ? <p className="cooking-workspace__success" role="status">Sua avaliação foi salva.</p> : null}
        <RatingForm onSave={saveRating} />
        <CookingHistory sessions={history} currentUserId={actorUserId} />
        <button type="button" className="button button--quiet" onClick={onExit}>Voltar à receita</button>
      </section>
    )
  }

  return <p className="auth-error" role="alert">Não foi possível abrir o modo cozinhar.</p>
}
