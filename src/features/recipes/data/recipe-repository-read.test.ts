import type { PowerSyncDatabase } from '@powersync/web'
import { describe, expect, it, vi } from 'vitest'
import { RecipeRepository } from './recipe-repository'

const pairId = '20000000-0000-4000-8000-000000000002'
const actorUserId = '10000000-0000-4000-8000-000000000001'
const recipeId = '40000000-0000-4000-8000-000000000004'

function databaseFixture() {
  const recipe = {
    id: recipeId, pair_id: pairId, revision: 2, title: 'Bolo', description: 'Fofo',
    base_yield_numerator: 4, base_yield_denominator: 1, base_yield_unit: 'porções',
    prep_time_seconds: 600, cook_time_seconds: 1800, total_time_seconds: 2400,
    favorite: 1, want_to_make: 0, already_made: 1, source_kind: 'manual', source_url: null,
    created_by: actorUserId, created_at: '2026-08-07T20:00:00.000Z', updated_at: '2026-08-07T21:00:00.000Z', deleted_at: null,
  }
  const ingredient = {
    id: '50000000-0000-4000-8000-000000000005', pair_id: pairId, revision: 1,
    recipe_id: recipeId, position: 0, quantity_numerator: 3, quantity_denominator: 2,
    quantity_text: null, unit: 'xícara', ingredient_name: 'Farinha', normalized_name: 'farinha',
    note: null, is_approximate: 1, is_optional: 1,
    created_at: recipe.created_at, updated_at: recipe.updated_at, deleted_at: null,
  }
  const step = {
    id: '60000000-0000-4000-8000-000000000006', pair_id: pairId, revision: 1,
    recipe_id: recipeId, position: 0, instruction: 'Misture.', duration_seconds: 120,
    observation: 'Sem bater demais', created_at: recipe.created_at, updated_at: recipe.updated_at, deleted_at: null,
  }

  return {
    getOptional: vi.fn(async (sql: string) => sql.includes('FROM recipes') ? recipe : null),
    getAll: vi.fn(async (sql: string) => {
      if (sql.includes('FROM recipe_ingredients')) return [ingredient]
      if (sql.includes('FROM recipe_steps')) return [step]
      if (sql.includes('FROM recipes')) return [recipe]
      return []
    }),
  } as unknown as PowerSyncDatabase
}

describe('RecipeRepository reads', () => {
  it('maps persisted recipe rows back to exact domain amounts, editing flags and derived history state', async () => {
    const repository = new RecipeRepository(databaseFixture(), { pairId, actorUserId })

    const recipe = await repository.getRecipe(recipeId)

    expect(recipe).not.toBeNull()
    expect(recipe?.title).toBe('Bolo')
    expect(recipe?.favorite).toBe(true)
    expect(recipe?.alreadyMade).toBe(true)
    expect(recipe?.baseYield).toEqual({ numerator: 4, denominator: 1 })
    expect(recipe?.ingredients[0]).toMatchObject({
      amount: { kind: 'numeric', value: { numerator: 3, denominator: 2 } },
      isApproximate: true,
      isOptional: true,
    })
    expect(recipe?.steps[0]).toMatchObject({ instruction: 'Misture.', note: 'Sem bater demais', durationSeconds: 120 })
  })

  it('lists active recipes with already-made derived from active cooking sessions', async () => {
    const database = databaseFixture()
    const repository = new RecipeRepository(database, { pairId, actorUserId })

    await expect(repository.listRecipes()).resolves.toEqual([
      expect.objectContaining({ id: recipeId, title: 'Bolo', favorite: true, wantToMake: false, alreadyMade: true }),
    ])
    expect(vi.mocked(database.getAll).mock.calls[0]?.[0]).toContain('EXISTS')
    expect(vi.mocked(database.getAll).mock.calls[0]?.[0]).toContain('cooking_sessions')
  })
})
