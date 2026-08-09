import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PowerSyncDatabase } from '@powersync/web'
import { usePowerSyncDatabase } from '../../data/PowerSyncProvider'
import { useAuth } from '../../features/auth/AuthProvider'
import { PlannerRepository } from '../../features/planner/data/planner-repository'
import { ConversionProfileRepository } from '../../features/recipes/data/conversion-profile-repository'
import { RecipeRepository, type RecipeSummary } from '../../features/recipes/data/recipe-repository'
import type { ConversionProfile } from '../../features/recipes/domain/types'
import { AddRecipesToShopping, type RecipeGenerationRequest } from '../../features/shopping/components/AddRecipesToShopping'
import { ShoppingListDetail } from '../../features/shopping/components/ShoppingListDetail'
import { ShoppingLists } from '../../features/shopping/components/ShoppingLists'
import { ShoppingRepository } from '../../features/shopping/data/shopping-repository'
import { consolidateShoppingItems } from '../../features/shopping/domain/consolidation'
import { generateShoppingItems, type ShoppingRecipeSelection } from '../../features/shopping/domain/generate-items'
import type { ConsolidatedShoppingItem, ShoppingItem, ShoppingItemDraft, ShoppingItemPatch, ShoppingList } from '../../features/shopping/domain/types'

export function ShoppingRoute() {
  const auth = useAuth()
  const database = usePowerSyncDatabase()
  const [lists, setLists] = useState<ShoppingList[]>([])
  const [activeListId, setActiveListId] = useState<string | null>(null)
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [recipes, setRecipes] = useState<RecipeSummary[]>([])
  const [conversionProfiles, setConversionProfiles] = useState<ConversionProfile[]>([])
  const [generatorOpen, setGeneratorOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const repositories = useMemo(() => {
    if (!auth.userId || !auth.pairId) return null
    const scope = { pairId: auth.pairId, actorUserId: auth.userId }
    return {
      shopping: new ShoppingRepository(database, scope),
      planner: new PlannerRepository(database, scope),
      recipes: new RecipeRepository(database, scope),
      conversions: new ConversionProfileRepository(database, scope),
    }
  }, [auth.userId, auth.pairId, database])

  const refresh = useCallback(async () => {
    if (!repositories) return
    const [nextLists, nextRecipes, nextProfiles] = await Promise.all([
      repositories.shopping.listShoppingLists(),
      repositories.recipes.listRecipes(),
      repositories.conversions.listDensityProfiles(),
    ])
    const currentStillExists = activeListId && nextLists.some((list) => list.id === activeListId)
    const nextActiveId = currentStillExists
      ? activeListId
      : nextLists.find((list) => list.isDefault)?.id ?? nextLists[0]?.id ?? null
    const nextItems = nextActiveId ? await repositories.shopping.listItems(nextActiveId) : []

    setLists(nextLists)
    setRecipes(nextRecipes)
    setConversionProfiles(nextProfiles)
    setActiveListId(nextActiveId)
    setItems(nextItems)
  }, [activeListId, repositories])

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!repositories) {
        if (active) setLoading(false)
        return
      }
      setLoading(true)
      try {
        await refresh()
        if (active) setError(null)
      } catch {
        if (active) setError('Não foi possível carregar as listas locais agora.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [refresh, repositories])

  useEffect(() => {
    if (!repositories) return
    const listener = database.registerListener({
      crudUpdate: () => void refresh().catch(() => setError('Não foi possível atualizar as listas locais.')),
    } as Parameters<PowerSyncDatabase['registerListener']>[0]) as unknown
    return () => {
      if (typeof listener === 'function') listener()
    }
  }, [database, refresh, repositories])

  const activeList = lists.find((list) => list.id === activeListId) ?? null

  async function createList(name: string) {
    if (!repositories) return
    const id = await repositories.shopping.createShoppingList(name, lists.length === 0)
    setActiveListId(id)
    const nextLists = await repositories.shopping.listShoppingLists()
    setLists(nextLists)
    setItems(await repositories.shopping.listItems(id))
  }

  async function setDefaultList(id: string) {
    if (!repositories) return
    await repositories.shopping.setDefaultList(id)
    await refresh()
  }

  async function addManualItem(draft: ShoppingItemDraft) {
    if (!repositories || !activeListId) return
    await repositories.shopping.addItem(activeListId, draft)
    await refresh()
  }

  async function updateItem(id: string, patch: ShoppingItemPatch) {
    if (!repositories) return
    await repositories.shopping.updateItem(id, patch)
    await refresh()
  }

  async function toggleItem(id: string, purchased: boolean) {
    if (!repositories) return
    await repositories.shopping.setPurchased(id, purchased)
    await refresh()
  }

  async function deleteItem(id: string) {
    if (!repositories) return
    await repositories.shopping.softDeleteItem(id)
    await refresh()
  }

  async function buildRecipeSelections(requests: RecipeGenerationRequest[]): Promise<ShoppingRecipeSelection[]> {
    if (!repositories) return []
    const selections = await Promise.all(requests.map(async (request) => {
      const recipe = await repositories.recipes.getRecipe(request.recipeId)
      if (!recipe) throw new Error('Recipe is not available locally')
      return {
        recipeId: recipe.id,
        ingredients: recipe.ingredients,
        baseServings: recipe.baseYield,
        requestedServings: request.servings,
        source: { kind: 'recipe' as const, recipeId: recipe.id },
      }
    }))
    return selections
  }

  async function buildRecipePreview(requests: RecipeGenerationRequest[]) {
    const selections = await buildRecipeSelections(requests)
    return consolidateShoppingItems(generateShoppingItems(selections), { pairOverrides: conversionProfiles })
  }

  async function buildPlannerPreview(range: { start: string; end: string }) {
    if (!repositories) return []
    const planned = await repositories.planner.listEntries(range)
    const selections = await Promise.all(planned.map(async (entry): Promise<ShoppingRecipeSelection> => {
      const recipe = await repositories.recipes.getRecipe(entry.recipeId)
      if (!recipe) throw new Error('Planned recipe is not available locally')
      return {
        recipeId: recipe.id,
        ingredients: recipe.ingredients,
        baseServings: recipe.baseYield,
        requestedServings: entry.servings,
        source: { kind: 'planner', recipeId: recipe.id, mealPlanEntryId: entry.id },
      }
    }))
    return consolidateShoppingItems(generateShoppingItems(selections), { pairOverrides: conversionProfiles })
  }

  async function confirmGeneratedItems(generated: ConsolidatedShoppingItem[]) {
    if (!repositories || !activeListId) return
    for (const item of generated) await repositories.shopping.addConsolidatedItem(activeListId, item)
    await refresh()
  }

  if (!repositories) {
    return (
      <section className="route-section" aria-labelledby="shopping-title">
        <p className="route-kicker">Para levar ao mercado</p>
        <h1 id="shopping-title">Compras</h1>
        <p className="route-intro">As listas locais ainda não estão disponíveis para esta sessão.</p>
      </section>
    )
  }

  return (
    <section className="shopping-workspace" aria-labelledby="shopping-title">
      <header className="shopping-workspace__header">
        <div>
          <p className="route-kicker">Para levar ao mercado</p>
          <h1 id="shopping-title">Compras</h1>
          <p className="route-intro">Listas compartilhadas continuam utilizáveis offline e sincronizam quando a conexão voltar.</p>
        </div>
      </header>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      {loading ? <p role="status">Carregando listas locais…</p> : null}

      {!loading ? (
        <div className="shopping-layout">
          <ShoppingLists
            lists={lists}
            activeListId={activeListId}
            onSelect={setActiveListId}
            onCreate={createList}
            onSetDefault={setDefaultList}
          />

          {activeList ? (
            <ShoppingListDetail
              list={activeList}
              items={items}
              onAddManual={addManualItem}
              onUpdate={updateItem}
              onToggle={toggleItem}
              onDelete={deleteItem}
              onOpenGenerate={() => setGeneratorOpen(true)}
            />
          ) : (
            <div className="shopping-no-list">
              <h2>Crie a primeira lista</h2>
              <p>Ela será marcada como padrão e poderá receber itens manuais ou gerados de receitas.</p>
            </div>
          )}
        </div>
      ) : null}

      {generatorOpen && activeList ? (
        <AddRecipesToShopping
          listName={activeList.name}
          recipes={recipes}
          onBuildRecipePreview={buildRecipePreview}
          onBuildPlannerPreview={buildPlannerPreview}
          onConfirm={confirmGeneratedItems}
          onClose={() => setGeneratorOpen(false)}
        />
      ) : null}
    </section>
  )
}
