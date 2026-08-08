import type { PowerSyncDatabase } from '@powersync/web'
import { describe, expect, it, vi } from 'vitest'
import type { MutationEnvelope } from '../../../data/mutations/types'
import { RecipeRepository, type RecipeDraft } from './recipe-repository'

const scope = {
  pairId: '20000000-0000-4000-8000-000000000002',
  actorUserId: '10000000-0000-4000-8000-000000000001',
}

const recipeId = '40000000-0000-4000-8000-000000000004'
const ingredientA = '50000000-0000-4000-8000-000000000005'
const ingredientB = '50000000-0000-4000-8000-000000000006'
const stepId = '60000000-0000-4000-8000-000000000006'

function draft(): RecipeDraft {
  return {
    id: recipeId,
    title: 'Bolo simples',
    description: 'Receita de teste',
    baseYield: { numerator: 4, denominator: 1 },
    baseYieldUnit: 'porções',
    prepTimeSeconds: 600,
    cookTimeSeconds: 1800,
    favorite: true,
    wantToMake: false,
    ingredients: [
      {
        id: ingredientA,
        amount: { kind: 'numeric', value: { numerator: 3, denominator: 2 } },
        unit: 'xícara',
        name: 'Farinha de trigo',
        note: null,
        isApproximate: false,
        isOptional: false,
      },
      {
        id: ingredientB,
        amount: { kind: 'text', text: 'a gosto' },
        unit: null,
        name: 'Canela',
        note: null,
        isApproximate: true,
        isOptional: true,
      },
    ],
    steps: [
      { id: stepId, instruction: 'Misture tudo.', durationSeconds: null, note: null },
    ],
  }
}

function fakeDatabase(options?: {
  recipe?: Record<string, unknown> | null
  ingredients?: Record<string, unknown>[]
  steps?: Record<string, unknown>[]
}) {
  const getOptional = vi.fn(async (sql: string) => {
    if (sql.includes('mutation_outbox')) return null
    if (sql.includes('FROM recipes')) return options?.recipe ?? null
    return null
  })
  const getAll = vi.fn(async (sql: string) => {
    if (sql.includes('FROM recipe_ingredients')) return options?.ingredients ?? []
    if (sql.includes('FROM recipe_steps')) return options?.steps ?? []
    return []
  })
  return { getOptional, getAll } as unknown as PowerSyncDatabase
}

describe('RecipeRepository', () => {
  it('creates recipe, ingredients and steps as stable local-first semantic mutations', async () => {
    const envelopes: MutationEnvelope[] = []
    const writer = vi.fn(async (_db: PowerSyncDatabase, envelope: MutationEnvelope) => {
      envelopes.push(envelope)
      return envelope.mutationId
    })
    const repository = new RecipeRepository(fakeDatabase(), scope, writer)

    await repository.createRecipe(draft())

    expect(envelopes.map((item) => item.entityType)).toEqual([
      'recipes', 'recipe_ingredients', 'recipe_ingredients', 'recipe_steps',
    ])
    expect(envelopes.map((item) => item.entityId)).toEqual([recipeId, ingredientA, ingredientB, stepId])
    expect(envelopes[0]?.next.favorite).toBe(1)
    expect(envelopes[0]?.next.want_to_make).toBe(0)
    expect('already_made' in (envelopes[0]?.next ?? {})).toBe(false)
    expect(envelopes[1]?.next).toMatchObject({
      recipe_id: recipeId,
      position: 0,
      quantity_numerator: 3,
      quantity_denominator: 2,
      quantity_text: null,
    })
    expect(envelopes[2]?.next).toMatchObject({
      position: 1,
      quantity_numerator: null,
      quantity_denominator: null,
      quantity_text: 'a gosto',
    })
  })

  it('reorders existing children by position without replacing their identities', async () => {
    const now = '2026-08-07T20:00:00.000Z'
    const recipe = {
      pair_id: scope.pairId, revision: 2, title: 'Bolo simples', description: null,
      base_yield_numerator: 4, base_yield_denominator: 1, base_yield_unit: 'porções',
      prep_time_seconds: null, cook_time_seconds: null, total_time_seconds: null,
      favorite: 0, want_to_make: 0, source_kind: 'manual', source_url: null,
      created_by: scope.actorUserId, created_at: now, updated_at: now, deleted_at: null,
    }
    const ingredientRows = [ingredientA, ingredientB].map((id, index) => ({
      id, pair_id: scope.pairId, revision: 1, recipe_id: recipeId, position: index,
      quantity_numerator: 1, quantity_denominator: 1, quantity_text: null,
      unit: null, ingredient_name: id === ingredientA ? 'Farinha' : 'Canela',
      normalized_name: id === ingredientA ? 'farinha' : 'canela', note: null,
      is_approximate: 0, is_optional: 0, created_at: now, updated_at: now, deleted_at: null,
    }))
    const envelopes: MutationEnvelope[] = []
    const writer = vi.fn(async (_db: PowerSyncDatabase, envelope: MutationEnvelope) => {
      envelopes.push(envelope)
      return envelope.mutationId
    })
    const repository = new RecipeRepository(fakeDatabase({ recipe, ingredients: ingredientRows }), scope, writer)
    const edited = draft()
    edited.ingredients = [edited.ingredients[1]!, edited.ingredients[0]!]

    await repository.updateRecipe(recipeId, edited)

    const childUpdates = envelopes.filter((item) => item.entityType === 'recipe_ingredients' && item.operation === 'update')
    expect(childUpdates.map((item) => item.entityId)).toEqual([ingredientB, ingredientA])
    expect(childUpdates.map((item) => item.next.position)).toEqual([0, 1])
  })

  it('soft deletes removed children instead of physically deleting them', async () => {
    const now = '2026-08-07T20:00:00.000Z'
    const recipe = {
      pair_id: scope.pairId, revision: 1, title: 'Bolo', description: null,
      base_yield_numerator: null, base_yield_denominator: null, base_yield_unit: null,
      prep_time_seconds: null, cook_time_seconds: null, total_time_seconds: null,
      favorite: 0, want_to_make: 0, source_kind: 'manual', source_url: null,
      created_by: scope.actorUserId, created_at: now, updated_at: now, deleted_at: null,
    }
    const existing = {
      id: ingredientA, pair_id: scope.pairId, revision: 3, recipe_id: recipeId, position: 0,
      quantity_numerator: 1, quantity_denominator: 1, quantity_text: null,
      unit: null, ingredient_name: 'Farinha', normalized_name: 'farinha', note: null,
      is_approximate: 0, is_optional: 0, created_at: now, updated_at: now, deleted_at: null,
    }
    const envelopes: MutationEnvelope[] = []
    const writer = vi.fn(async (_db: PowerSyncDatabase, envelope: MutationEnvelope) => {
      envelopes.push(envelope)
      return envelope.mutationId
    })
    const repository = new RecipeRepository(fakeDatabase({ recipe, ingredients: [existing] }), scope, writer)
    const edited = draft()
    edited.ingredients = []

    await repository.updateRecipe(recipeId, edited)

    const deletion = envelopes.find((item) => item.entityType === 'recipe_ingredients' && item.entityId === ingredientA)
    expect(deletion?.operation).toBe('soft_delete')
    expect(typeof deletion?.next.deleted_at).toBe('string')
  })
})
