import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PowerSyncDatabase } from '@powersync/web'
import { usePowerSyncDatabase } from '../../data/PowerSyncProvider'
import { useAuth } from '../../features/auth/AuthProvider'
import { RecipeDetail } from '../../features/recipes/components/RecipeDetail'
import { RecipeEditor } from '../../features/recipes/components/RecipeEditor'
import {
  RecipeRepository,
  type RecipeAggregate,
  type RecipeDraft,
  type RecipeSummary,
} from '../../features/recipes/data/recipe-repository'

type RecipesRouteMode = 'list' | 'create' | 'view' | 'edit'

function formatUpdatedAt(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(date)
}

function formatMinutes(seconds: number | null): string | null {
  if (seconds === null) return null
  return `${Math.round(seconds / 60)} min`
}

export function RecipesRoute() {
  const auth = useAuth()
  const database = usePowerSyncDatabase()
  const [mode, setMode] = useState<RecipesRouteMode>('list')
  const [recipes, setRecipes] = useState<RecipeSummary[]>([])
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeAggregate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const repository = useMemo(() => {
    if (!auth.userId || !auth.pairId) return null
    return new RecipeRepository(database, { pairId: auth.pairId, actorUserId: auth.userId })
  }, [auth.userId, auth.pairId, database])

  const refreshRecipes = useCallback(async () => {
    if (!repository) return
    const rows = await repository.listRecipes()
    setRecipes(rows)
  }, [repository])

  const refreshSelected = useCallback(async () => {
    if (!repository || !selectedRecipe) return
    const next = await repository.getRecipe(selectedRecipe.id)
    if (!next) {
      setSelectedRecipe(null)
      setMode('list')
      return
    }
    setSelectedRecipe(next)
  }, [repository, selectedRecipe])

  const refreshLocalState = useCallback(async () => {
    try {
      await refreshRecipes()
      await refreshSelected()
      setError(null)
    } catch {
      setError('Não foi possível atualizar as receitas locais agora.')
    }
  }, [refreshRecipes, refreshSelected])

  useEffect(() => {
    let active = true

    const initialLoad = async () => {
      if (!repository) {
        setLoading(false)
        return
      }
      try {
        const rows = await repository.listRecipes()
        if (active) {
          setRecipes(rows)
          setError(null)
        }
      } catch {
        if (active) setError('Não foi possível ler as receitas deste dispositivo.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void initialLoad()
    return () => { active = false }
  }, [repository])

  useEffect(() => {
    if (!repository) return
    const listener = database.registerListener({
      crudUpdate: () => void refreshLocalState(),
    } as Parameters<PowerSyncDatabase['registerListener']>[0]) as unknown

    return () => {
      if (typeof listener === 'function') listener()
    }
  }, [database, repository, refreshLocalState])

  async function openRecipe(id: string): Promise<void> {
    if (!repository) return
    setError(null)
    try {
      const recipe = await repository.getRecipe(id)
      if (!recipe) {
        setError('Esta receita não está mais disponível neste dispositivo.')
        await refreshRecipes()
        return
      }
      setSelectedRecipe(recipe)
      setMode('view')
    } catch {
      setError('Não foi possível abrir esta receita.')
    }
  }

  async function saveNewRecipe(draft: RecipeDraft): Promise<void> {
    if (!repository) return
    await repository.createRecipe(draft)
    await refreshRecipes()
    const recipe = await repository.getRecipe(draft.id)
    if (!recipe) throw new Error('A receita foi salva localmente, mas ainda não pôde ser reaberta.')
    setSelectedRecipe(recipe)
    setMode('view')
  }

  async function saveEditedRecipe(draft: RecipeDraft): Promise<void> {
    if (!repository || !selectedRecipe) return
    await repository.updateRecipe(selectedRecipe.id, draft)
    await refreshRecipes()
    const recipe = await repository.getRecipe(selectedRecipe.id)
    if (!recipe) throw new Error('A receita editada não pôde ser reaberta.')
    setSelectedRecipe(recipe)
    setMode('view')
  }

  async function deleteSelectedRecipe(): Promise<void> {
    if (!repository || !selectedRecipe) return
    setError(null)
    try {
      await repository.softDeleteRecipe(selectedRecipe.id)
      setConfirmingDelete(false)
      setSelectedRecipe(null)
      setMode('list')
      await refreshRecipes()
    } catch {
      setError('Não foi possível mover a receita para a lixeira.')
    }
  }

  if (!repository) {
    return (
      <section className="route-section" aria-labelledby="recipes-title">
        <p className="route-kicker">Nosso caderno</p>
        <h1 id="recipes-title">Receitas</h1>
        <p className="route-intro">O caderno local ainda não está disponível para esta sessão.</p>
      </section>
    )
  }

  if (mode === 'create') {
    return (
      <section className="recipes-workspace" aria-labelledby="new-recipe-title">
        <header className="recipes-workspace__header">
          <div>
            <p className="route-kicker">Nosso caderno</p>
            <h1 id="new-recipe-title">Nova receita</h1>
            <p className="route-intro">As alterações são salvas primeiro neste dispositivo e entram na fila de sincronização.</p>
          </div>
        </header>
        <RecipeEditor onSave={saveNewRecipe} onCancel={() => setMode('list')} />
      </section>
    )
  }

  if (mode === 'edit' && selectedRecipe) {
    return (
      <section className="recipes-workspace" aria-labelledby="edit-recipe-title">
        <header className="recipes-workspace__header">
          <div>
            <p className="route-kicker">Editar</p>
            <h1 id="edit-recipe-title">{selectedRecipe.title}</h1>
          </div>
        </header>
        <RecipeEditor initial={selectedRecipe} onSave={saveEditedRecipe} onCancel={() => setMode('view')} />
      </section>
    )
  }

  if (mode === 'view' && selectedRecipe) {
    return (
      <section className="recipes-workspace">
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <RecipeDetail
          recipe={selectedRecipe}
          onBack={() => { setSelectedRecipe(null); setMode('list') }}
          onEdit={() => setMode('edit')}
          onDelete={() => setConfirmingDelete(true)}
        />
        {confirmingDelete ? (
          <div className="recipe-delete-confirmation" role="dialog" aria-modal="true" aria-labelledby="delete-recipe-title">
            <div>
              <p className="route-kicker">Lixeira</p>
              <h2 id="delete-recipe-title">Mover “{selectedRecipe.title}” para a lixeira?</h2>
              <p>A receita deixa de aparecer no caderno, mas continua recuperável até a limpeza definitiva da lixeira.</p>
            </div>
            <div className="recipe-delete-confirmation__actions">
              <button type="button" className="button button--quiet" onClick={() => setConfirmingDelete(false)}>Cancelar</button>
              <button type="button" className="button button--primary" onClick={() => void deleteSelectedRecipe()}>Mover para a lixeira</button>
            </div>
          </div>
        ) : null}
      </section>
    )
  }

  return (
    <section className="recipes-workspace" aria-labelledby="recipes-title">
      <header className="recipes-workspace__header">
        <div>
          <p className="route-kicker">Nosso caderno</p>
          <h1 id="recipes-title">Receitas</h1>
          <p className="route-intro">Receitas deste par ficam disponíveis localmente e continuam editáveis sem internet.</p>
        </div>
        <button type="button" className="button button--primary" onClick={() => setMode('create')}>Nova receita</button>
      </header>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      {loading ? <p role="status">Carregando receitas locais…</p> : null}

      {!loading && recipes.length === 0 ? (
        <div className="recipe-library-empty">
          <h2>Nenhuma receita ainda</h2>
          <p>Cadastre a primeira receita para começar o caderno compartilhado.</p>
          <button type="button" className="button button--primary" onClick={() => setMode('create')}>Nova receita</button>
        </div>
      ) : null}

      {recipes.length > 0 ? (
        <div className="recipe-library" aria-label="Receitas salvas">
          {recipes.map((recipe) => {
            const time = formatMinutes(recipe.totalTimeSeconds)
            const updated = formatUpdatedAt(recipe.updatedAt)
            return (
              <button
                key={recipe.id}
                type="button"
                className="recipe-library__item"
                aria-label={`Abrir ${recipe.title}`}
                onClick={() => void openRecipe(recipe.id)}
              >
                <span className="recipe-library__title-row">
                  <strong>{recipe.title}</strong>
                  {recipe.favorite ? <span aria-label="Favorita">★</span> : null}
                </span>
                {recipe.description ? <span className="recipe-library__description">{recipe.description}</span> : null}
                <span className="recipe-library__meta">
                  {recipe.wantToMake ? <span>Queremos fazer</span> : null}
                  {time ? <span>{time}</span> : null}
                  {updated ? <span>Atualizada {updated}</span> : null}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
