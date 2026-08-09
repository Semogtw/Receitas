import type { PowerSyncDatabase } from '@powersync/web'
import { describe, expect, it, vi } from 'vitest'
import { EMPTY_RECIPE_SEARCH_QUERY } from '../domain/search'
import { LocalRecipeSearch } from './search-index'

const pairId = '20000000-0000-4000-8000-000000000002'
const recipeId = '40000000-0000-4000-8000-000000000004'

function fakeDatabase() {
  return {
    getAll: vi.fn(async (sql: string) => {
      if (sql.includes('FROM recipes')) return [{
        id: recipeId,
        title: 'Pão de queijo',
        description: 'Receita da casa',
        favorite: 1,
        want_to_make: 0,
        updated_at: '2026-08-08T12:00:00.000Z',
      }]
      if (sql.includes('FROM recipe_ingredients')) return [{
        recipe_id: recipeId,
        ingredient_name: 'Polvilho azedo',
        note: 'peneirado',
      }]
      if (sql.includes('FROM recipe_categories')) return [{
        recipe_id: recipeId,
        category_id: 'cat-lanche',
        category_name: 'Lanches',
      }]
      if (sql.includes('FROM recipe_steps')) return [{
        recipe_id: recipeId,
        observation: 'Forno bem quente',
      }]
      if (sql.includes('FROM cooking_sessions') && !sql.includes('ratings')) return [
        { id: 'session-a', recipe_id: recipeId },
        { id: 'session-b', recipe_id: recipeId },
      ]
      if (sql.includes('FROM cooking_session_ratings')) return [
        { recipe_id: recipeId, score: 4 },
        { recipe_id: recipeId, score: 5 },
      ]
      if (sql.includes('FROM recipe_photos')) return [
        { id: 'cover-photo', recipe_id: recipeId, is_cover: 1, position: 2 },
        { id: 'other-photo', recipe_id: recipeId, is_cover: 0, position: 0 },
      ]
      return []
    }),
  } as unknown as PowerSyncDatabase
}

describe('LocalRecipeSearch', () => {
  it('derives searchable documents and aggregates only from local canonical tables', async () => {
    const database = fakeDatabase()
    const search = new LocalRecipeSearch(database, pairId)

    const documents = await search.loadDocuments()

    expect(documents).toEqual([{
      recipeId,
      title: 'Pão de queijo',
      coverPhotoId: 'cover-photo',
      favorite: true,
      wantToMake: false,
      alreadyMade: true,
      preparationCount: 2,
      averageRating: 4.5,
      updatedAt: '2026-08-08T12:00:00.000Z',
      description: 'Receita da casa',
      ingredientNames: ['Polvilho azedo'],
      categoryIds: ['cat-lanche'],
      categoryNames: ['Lanches'],
      notes: ['peneirado', 'Forno bem quente'],
    }])
    expect(vi.mocked(database.getAll).mock.calls.every(([, params]) => params?.[0] === pairId)).toBe(true)
  })

  it('searches the loaded snapshot without any remote service', async () => {
    const search = new LocalRecipeSearch(fakeDatabase(), pairId)

    const results = await search.searchRecipes({ ...EMPTY_RECIPE_SEARCH_QUERY, text: 'polvilho quente' })

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ recipeId, title: 'Pão de queijo', preparationCount: 2, averageRating: 4.5 })
  })

  it('keeps missing ratings as null', async () => {
    const database = fakeDatabase()
    vi.mocked(database.getAll).mockImplementation(async (sql: string) => {
      if (sql.includes('FROM recipes')) return [{
        id: recipeId,
        title: 'Sem avaliação',
        description: null,
        favorite: 0,
        want_to_make: 0,
        updated_at: '2026-08-08T12:00:00.000Z',
      }] as never
      if (sql.includes('FROM cooking_sessions') && !sql.includes('ratings')) return [{ id: 'session-a', recipe_id: recipeId }] as never
      return [] as never
    })
    const search = new LocalRecipeSearch(database, pairId)

    const [result] = await search.searchRecipes(EMPTY_RECIPE_SEARCH_QUERY)

    expect(result).toMatchObject({ alreadyMade: true, preparationCount: 1, averageRating: null })
  })

  it('scopes every canonical query to active pair rows', async () => {
    const database = fakeDatabase()
    const search = new LocalRecipeSearch(database, pairId)

    await search.loadDocuments()

    const sqlStatements = vi.mocked(database.getAll).mock.calls.map(([sql]) => String(sql))
    expect(sqlStatements.every((sql) => sql.includes('pair_id = ?') || sql.includes('pair_id = r.pair_id'))).toBe(true)
    expect(sqlStatements.every((sql) => sql.includes('deleted_at IS NULL'))).toBe(true)
  })
})
