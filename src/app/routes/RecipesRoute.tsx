import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PowerSyncDatabase } from '@powersync/web'
import { usePowerSyncDatabase } from '../../data/PowerSyncProvider'
import { useAuth } from '../../features/auth/AuthProvider'
import { RecipeDetail } from '../../features/recipes/components/RecipeDetail'
import { RecipeEditor } from '../../features/recipes/components/RecipeEditor'
import { CategoryRepository, type RecipeCategory } from '../../features/recipes/data/category-repository'
import { ConversionProfileRepository } from '../../features/recipes/data/conversion-profile-repository'
import type { ConversionProfile } from '../../features/recipes/domain/types'
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
  const [categories, setCategories] = useState<RecipeCategory[]>([])
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [conversionProfiles, setConversionProfiles] = useState<ConversionProfile[]>([])
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeAggregate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const repositories = useMemo(() => {
    if (!auth.userId || !auth.pairId) return null
    const scope = { pairId: auth.pairId, actorUserId: auth.userId }
    return {
      recipes: new RecipeRepository(database, scope),
      categories: new CategoryRepository(database, scope),
      conversions: new ConversionProfileRepository(database, scope),
    }
  }, [auth.userId, auth.pairId, database])

  const refreshRecipes = useCallback(async () => {
    if (!repositories) return
    setRecipes(await repositories.recipes.listRecipes())
  }, [repositories])

  const refreshReferenceData = useCallback(async () => {
    if (!repositories) return
    const [nextCategories, nextProfiles] = await Promise.all([
      repositories.categories.listCategories(),
      repositories.conversions.listDensityProfiles(),
    ])
    setCategories(nextCategories)
    setConversionProfiles(nextProfiles)
  }, [repositories])

  const refreshSelected = useCallback(async () => {
    if (!repositories || !selectedRecipe) return
    const [next, categoryIds] = await Promise.all([
      repositories.recipes.getRecipe(selectedRecipe.id),
      repositories.categories.listRecipeCategoryIds(selectedRecipe.id),
    ])
    if (!next) {
      setSelectedRecipe(null)
      setSelectedCategoryIds([])
      setMode('list')
      return
    }
    setSelectedRecipe(next)
    setSelectedCategoryIds(categoryIds)
  }, [repositories, selectedRecipe])

  const refreshLocalState = useCallback(async () => {
    try {
      await Promise.all([refreshRecipes(), refreshReferenceData(), refreshSelected()])
      setError(null)
    } catch {
      setError('Não foi possível atualizar as receitas locais agora.')
    }
  }, [refreshRecipes, refreshReferenceData, refreshSelected])

  useEffect(() => {
    let active = true

    const initialLoad = async () => {
      if (!repositories) {
        setLoading(false)
        return
      }
      try {
        const [rows, nextCategories, nextProfiles] = await Promise.all([
          repositories.recipes.listRecipes(),
          repositories.categories.listCategories(),
          repositories.conversions.listDensityProfiles(),
        ])
        if (active) {
          setRecipes(rows)
          setCategories(nextCategories)
          setConversionProfiles(nextProfiles)
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
  }, [repositories])

  useEffect(() => {
    if (!repositories) return
    const listener = database.registerListener({
      crudUpdate: () => void refreshLocalState(),
    } as Parameters<PowerSyncDatabase['registerListener']>[0]) as unknown

    return () => {
      if (typeof listener === 'function') listener()
    }
  }, [database, repositories, refreshLocalState])

  async function openRecipe(id: string): Promise<void> {
    if (!repositories) return
    setError(null)
    try {
      const [recipe, categoryIds] = await Promise.all([
        repositories.recipes.getRecipe(id),
        repositories.categories.listRecipeCategoryIds(id),
      ])
      if (!recipe) {
        setError('Esta receita não está mais disponível neste dispositivo.')
        await refreshRecipes()
        return
      }
      setSelectedRecipe(recipe)
      setSelectedCategoryIds(categoryIds)
      setMode('view')
    } catch {
      setError('Não foi possível abrir esta receita.')
    }
  }

  async function saveNewRecipe(draft: RecipeDraft, categoryIds: string[]): Promise<void> {
    if (!repositories) return
    await repositories.recipes.createRecipe(draft)
    await repositories.categories.setRecipeCategories(draft.id, categoryIds)
    await refreshRecipes()
    const recipe = await repositories.recipes.getRecipe(draft.id)
    if (!recipe) throw new Error('A receita foi salva localmente, mas ainda não pôde ser reaberta.')
    setSelectedRecipe(recipe)
    setSelectedCategoryIds(categoryIds)
    setMode('view')
  }

  async function saveEditedRecipe(draft: RecipeDraft, categoryIds: string[]): Promise<void> {
    if (!repositories || !selectedRecipe) return
    await repositories.recipes.updateRecipe(selectedRecipe.id, draft)
    await repositories.categories.setRecipeCategories(selectedRecipe.id, categoryIds)
    await refreshRecipes()
    const recipe = await repositories.recipes.getRecipe(selectedRecipe.id)
    if (!recipe) throw new Error('A receita editada não pôde ser reaberta.')
    setSelectedRecipe(recipe)
    setSelectedCategoryIds(categoryIds)
    setMode('view')
  }

  async function deleteSelectedRecipe(): Promise<void> {
    if (!repositories || !selectedRecipe) return
    setError(null)
    try {
      await repositories.recipes.softDeleteRecipe(selectedRecipe.id)
      setConfirmingDelete(false)
      setSelectedRecipe(null)
      setSelectedCategoryIds([])
      setMode('list')
      await refreshRecipes()
    } catch {
      setError('Não foi possível mover a receita para a lixeira.')
    }
  }

  if (!repositories) {
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
        <RecipeEditor
          availableCategories={categories}
          initialCategoryIds={[]}
          onSave={saveNewRecipe}
          onCancel={() => setMode('list')}
        />
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
        <RecipeEditor
          initial={selectedRecipe}
          availableCategories={categories}
          initialCategoryIds={selectedCategoryIds}
          onSave={saveEditedRecipe}
          onCancel={() => setMode('view')}
        />
      </section>
    )
  }

  if (mode === 'view' && selectedRecipe) {
    return (
      <section className="recipes-workspace">
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <RecipeDetail
          recipe={selectedRecipe}
          conversionProfiles={conversionProfiles}
          onBack={() => { setSelectedRecipe(null); setSelectedCategoryIds([]); setMode('list') }}
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
