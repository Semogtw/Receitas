import type { PowerSyncDatabase } from '@powersync/web'
import { describe, expect, it, vi } from 'vitest'
import type { MutationEnvelope } from '../../../data/mutations/types'
import type { RecipeDraft } from '../../recipes/data/recipe-repository'
import { ImportSaveService, buildRecipeDraftFromImport } from './import-save-service'
import type { ImportedRecipeDraft } from '../domain/normalize-import'

const scope = {
  pairId: '20000000-0000-4000-8000-000000000002',
  actorUserId: '10000000-0000-4000-8000-000000000001',
}

function imported(overrides: Partial<ImportedRecipeDraft> = {}): ImportedRecipeDraft {
  return {
    title: 'Bolo de cenoura',
    description: 'Receita importada para revisão',
    sourceUrl: 'https://example.com/bolo',
    servings: '8 porções',
    prepTimeMinutes: 15,
    cookTimeMinutes: 40,
    ingredients: [
      { raw: '2 xícaras de farinha' },
      { raw: 'sal a gosto' },
    ],
    steps: [{ instruction: 'Misture os ingredientes.' }],
    imageUrl: 'https://example.com/bolo.jpg',
    warnings: ['Revise antes de salvar.'],
    ...overrides,
  }
}

describe('buildRecipeDraftFromImport', () => {
  it('maps reviewed import data without dropping unparsed ingredient text', () => {
    const draft = buildRecipeDraftFromImport(imported())

    expect(draft.title).toBe('Bolo de cenoura')
    expect(draft.description).toBe('Receita importada para revisão')
    expect(draft.baseYield).toEqual({ numerator: 8, denominator: 1 })
    expect(draft.baseYieldUnit).toBe('porções')
    expect(draft.prepTimeSeconds).toBe(900)
    expect(draft.cookTimeSeconds).toBe(2400)
    expect(draft.ingredients[0]).toMatchObject({
      amount: { kind: 'numeric', value: { numerator: 2, denominator: 1 } },
      unit: 'xícaras',
      name: 'farinha',
    })
    expect(draft.ingredients[1]).toMatchObject({
      amount: { kind: 'none' },
      unit: null,
      name: 'sal a gosto',
    })
    expect(draft.steps[0]?.instruction).toBe('Misture os ingredientes.')
  })

  it('requires a reviewed title instead of inventing one', () => {
    expect(() => buildRecipeDraftFromImport(imported({ title: '   ' }))).toThrow(
      'Imported recipe title is required before saving',
    )
  })

  it('keeps non-structured servings reviewable without inventing a yield', () => {
    const draft = buildRecipeDraftFromImport(imported({ servings: 'serve uma família' }))
    expect(draft.baseYield).toBeNull()
    expect(draft.baseYieldUnit).toBeNull()
  })
})

describe('ImportSaveService', () => {
  it('coalesces URL provenance onto the recipe created by the canonical repository', async () => {
    let createdDraft: RecipeDraft | null = null
    const recipes = {
      createRecipe: vi.fn(async (draft: RecipeDraft) => {
        createdDraft = draft
        return draft.id
      }),
    }
    const database = {
      getOptional: vi.fn(async (sql: string) => {
        if (sql.includes('mutation_outbox')) {
          return { base_revision: null, base_payload: null }
        }
        if (sql.includes('FROM recipes')) {
          return {
            id: createdDraft?.id ?? 'missing',
            pair_id: scope.pairId,
            revision: 0,
            title: 'Bolo de cenoura',
            description: null,
            source_kind: 'manual',
            source_url: null,
            favorite: 0,
            want_to_make: 0,
            created_by: scope.actorUserId,
            created_at: '2026-08-09T00:00:00.000Z',
            updated_at: '2026-08-09T00:00:00.000Z',
            deleted_at: null,
          }
        }
        return null
      }),
    } as unknown as PowerSyncDatabase
    const envelopes: MutationEnvelope[] = []
    const writer = vi.fn(async (_database: PowerSyncDatabase, envelope: MutationEnvelope) => {
      envelopes.push(envelope)
      return envelope.mutationId
    })
    const service = new ImportSaveService(database, scope, recipes, writer)

    const id = await service.save(imported(), 'schema_org')

    expect(id).toBe(createdDraft?.id)
    expect(recipes.createRecipe).toHaveBeenCalledTimes(1)
    expect(envelopes).toHaveLength(1)
    expect(envelopes[0]).toMatchObject({
      entityType: 'recipes',
      entityId: id,
      operation: 'update',
      baseRevision: null,
      base: null,
    })
    expect(envelopes[0]?.next).toMatchObject({
      source_kind: 'url',
      source_url: 'https://example.com/bolo',
    })
  })

  it('stores pasted-text provenance without a remote URL', async () => {
    const recipes = { createRecipe: vi.fn(async (draft: RecipeDraft) => draft.id) }
    const database = {
      getOptional: vi.fn(async (sql: string) => {
        if (sql.includes('mutation_outbox')) return { base_revision: null, base_payload: null }
        return {
          id: '40000000-0000-4000-8000-000000000004',
          pair_id: scope.pairId,
          revision: 0,
          title: 'Bolo de cenoura',
          source_kind: 'manual',
          source_url: null,
          created_by: scope.actorUserId,
          created_at: '2026-08-09T00:00:00.000Z',
          updated_at: '2026-08-09T00:00:00.000Z',
          deleted_at: null,
        }
      }),
    } as unknown as PowerSyncDatabase
    const envelopes: MutationEnvelope[] = []
    const service = new ImportSaveService(
      database,
      scope,
      recipes,
      async (_db, envelope) => { envelopes.push(envelope); return envelope.mutationId },
    )

    await service.save(imported({ sourceUrl: null }), 'pasted_text')

    expect(envelopes[0]?.next.source_kind).toBe('text')
    expect(envelopes[0]?.next.source_url).toBeNull()
  })
})
