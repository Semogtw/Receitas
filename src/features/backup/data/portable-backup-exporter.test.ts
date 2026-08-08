import type { PowerSyncDatabase } from '@powersync/web'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fakes = vi.hoisted(() => ({
  listRecipes: vi.fn(),
  getRecipe: vi.fn(),
  listCategories: vi.fn(),
  listRecipeCategoryIds: vi.fn(),
  listDensityProfiles: vi.fn(),
  listRecipeHistory: vi.fn(),
  listRecipePhotos: vi.fn(),
  listCookingSessionPhotos: vi.fn(),
}))

vi.mock('../../recipes/data/recipe-repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../recipes/data/recipe-repository')>()
  return {
    ...actual,
    RecipeRepository: class {
      listRecipes = fakes.listRecipes
      getRecipe = fakes.getRecipe
    },
  }
})

vi.mock('../../recipes/data/category-repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../recipes/data/category-repository')>()
  return {
    ...actual,
    CategoryRepository: class {
      listCategories = fakes.listCategories
      listRecipeCategoryIds = fakes.listRecipeCategoryIds
    },
  }
})

vi.mock('../../recipes/data/conversion-profile-repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../recipes/data/conversion-profile-repository')>()
  return {
    ...actual,
    ConversionProfileRepository: class {
      listDensityProfiles = fakes.listDensityProfiles
    },
  }
})

vi.mock('../../cooking/data/cooking-repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../cooking/data/cooking-repository')>()
  return {
    ...actual,
    CookingRepository: class {
      listRecipeHistory = fakes.listRecipeHistory
    },
  }
})

vi.mock('../../media/data/photo-read-repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../media/data/photo-read-repository')>()
  return {
    ...actual,
    PhotoReadRepository: class {
      listRecipePhotos = fakes.listRecipePhotos
      listCookingSessionPhotos = fakes.listCookingSessionPhotos
    },
  }
})

import { exportPortableBackup } from './portable-backup-exporter'

const recipe = {
  id: 'recipe-a',
  revision: 2,
  title: 'Bolo',
  description: null,
  favorite: true,
  wantToMake: false,
  baseYield: { numerator: 4, denominator: 1 },
  baseYieldUnit: 'porções',
  prepTimeSeconds: 600,
  cookTimeSeconds: 1200,
  totalTimeSeconds: 1800,
  updatedAt: '2026-08-07T20:00:00.000Z',
  ingredients: [],
  steps: [],
}

const session = {
  id: 'session-a',
  recipeId: 'recipe-a',
  recordedBy: 'user-a',
  startedAt: null,
  preparedAt: '2026-08-07T21:00:00.000Z',
  preparedYield: null,
  sharedObservation: null,
  snapshot: {
    version: 1,
    recipeId: 'recipe-a',
    recipeRevision: 2,
    title: 'Bolo',
    description: null,
    baseYield: null,
    baseYieldUnit: null,
    prepTimeSeconds: null,
    cookTimeSeconds: null,
    totalTimeSeconds: null,
    ingredients: [],
    steps: [],
  },
  ratings: [],
  averageScore: null,
}

describe('exportPortableBackup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fakes.listRecipes.mockResolvedValue([{ ...recipe }])
    fakes.getRecipe.mockResolvedValue(recipe)
    fakes.listCategories.mockResolvedValue([{ id: 'category-a', name: 'Sobremesas' }])
    fakes.listRecipeCategoryIds.mockResolvedValue(['category-a'])
    fakes.listDensityProfiles.mockResolvedValue([])
    fakes.listRecipeHistory.mockResolvedValue([session])
    fakes.listRecipePhotos.mockResolvedValue([
      { id: 'recipe-photo-a', storagePath: 'recipe.webp', position: 0, caption: null, createdAt: '2026-08-07T20:10:00.000Z' },
    ])
    fakes.listCookingSessionPhotos.mockResolvedValue([
      { id: 'session-photo-a', storagePath: 'session.webp', position: 0, caption: 'Pronto', createdAt: '2026-08-07T21:10:00.000Z' },
    ])
  })

  it('collects categories, recipes, assignments, cooking history and photo metadata but no local transient state', async () => {
    const archive = await exportPortableBackup(
      {} as PowerSyncDatabase,
      { pairId: 'pair-a', actorUserId: 'user-a' },
      '2026-08-07T22:00:00.000Z',
    )

    expect(archive).toMatchObject({
      format: 'receitas-portable-backup',
      version: 1,
      scope: 'active-shared-data',
      exportedAt: '2026-08-07T22:00:00.000Z',
      sourcePairId: 'pair-a',
      categories: [{ id: 'category-a', name: 'Sobremesas' }],
      recipes: [{
        recipe: expect.objectContaining({ id: 'recipe-a', title: 'Bolo' }),
        categoryIds: ['category-a'],
        history: [expect.objectContaining({ id: 'session-a' })],
        photos: [expect.objectContaining({ id: 'recipe-photo-a' })],
        sessionPhotos: { 'session-a': [expect.objectContaining({ id: 'session-photo-a' })] },
      }],
    })
    expect(JSON.stringify(archive)).not.toContain('mutation_outbox')
    expect(JSON.stringify(archive)).not.toContain('active_cooking_draft')
    expect(JSON.stringify(archive)).not.toContain('media_upload_queue')
  })

  it('fails rather than writing a silently partial backup when a recipe disappears during collection', async () => {
    fakes.getRecipe.mockResolvedValueOnce(null)

    await expect(exportPortableBackup(
      {} as PowerSyncDatabase,
      { pairId: 'pair-a', actorUserId: 'user-a' },
      '2026-08-07T22:00:00.000Z',
    )).rejects.toThrow('changed during backup')
  })
})
