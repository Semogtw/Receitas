import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const recipeId = '40000000-0000-4000-8000-000000000004'
const categoryId = '70000000-0000-4000-8000-000000000007'

const fakes = vi.hoisted(() => ({
  listRecipes: vi.fn(),
  getRecipe: vi.fn(),
  createRecipe: vi.fn(),
  updateRecipe: vi.fn(),
  softDeleteRecipe: vi.fn(),
  listCategories: vi.fn(),
  listRecipeCategoryIds: vi.fn(),
  setRecipeCategories: vi.fn(),
  listDensityProfiles: vi.fn(),
  registerListener: vi.fn((_listener: { crudUpdate(): void }) => vi.fn()),
}))

vi.mock('../../features/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'ready',
    userId: '10000000-0000-4000-8000-000000000001',
    pairId: '20000000-0000-4000-8000-000000000002',
  }),
}))

vi.mock('../../data/PowerSyncProvider', () => ({
  usePowerSyncDatabase: () => ({ registerListener: fakes.registerListener }),
}))

vi.mock('../../features/recipes/data/recipe-repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/recipes/data/recipe-repository')>()
  return {
    ...actual,
    RecipeRepository: class {
      listRecipes = fakes.listRecipes
      getRecipe = fakes.getRecipe
      createRecipe = fakes.createRecipe
      updateRecipe = fakes.updateRecipe
      softDeleteRecipe = fakes.softDeleteRecipe
    },
  }
})

vi.mock('../../features/recipes/data/category-repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/recipes/data/category-repository')>()
  return {
    ...actual,
    CategoryRepository: class {
      listCategories = fakes.listCategories
      listRecipeCategoryIds = fakes.listRecipeCategoryIds
      setRecipeCategories = fakes.setRecipeCategories
    },
  }
})

vi.mock('../../features/recipes/data/conversion-profile-repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/recipes/data/conversion-profile-repository')>()
  return {
    ...actual,
    ConversionProfileRepository: class {
      listDensityProfiles = fakes.listDensityProfiles
    },
  }
})

import { RecipesRoute } from './RecipesRoute'

const summary = {
  id: recipeId,
  title: 'Bolo simples',
  description: 'Fofo',
  favorite: true,
  wantToMake: false,
  baseYield: { numerator: 4, denominator: 1 },
  baseYieldUnit: 'porções',
  prepTimeSeconds: 600,
  cookTimeSeconds: 1800,
  totalTimeSeconds: 2400,
  updatedAt: '2026-08-07T21:00:00.000Z',
}

const aggregate = {
  ...summary,
  revision: 1,
  ingredients: [],
  steps: [],
}

describe('RecipesRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fakes.listRecipes.mockResolvedValue([summary])
    fakes.getRecipe.mockResolvedValue(aggregate)
    fakes.createRecipe.mockResolvedValue(recipeId)
    fakes.updateRecipe.mockResolvedValue(undefined)
    fakes.softDeleteRecipe.mockResolvedValue(undefined)
    fakes.listCategories.mockResolvedValue([{ id: categoryId, name: 'Sobremesas' }])
    fakes.listRecipeCategoryIds.mockResolvedValue([categoryId])
    fakes.setRecipeCategories.mockResolvedValue(undefined)
    fakes.listDensityProfiles.mockResolvedValue([])
  })

  it('loads the local recipe library and opens a recipe detail', async () => {
    const user = userEvent.setup()
    render(<RecipesRoute />)

    expect(await screen.findByRole('button', { name: /Abrir Bolo simples/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Abrir Bolo simples/ }))

    expect(await screen.findByRole('heading', { name: 'Bolo simples' })).toBeInTheDocument()
    expect(fakes.getRecipe).toHaveBeenCalledWith(recipeId)
    expect(fakes.listRecipeCategoryIds).toHaveBeenCalledWith(recipeId)
  })

  it('creates a recipe locally and synchronizes category assignments separately', async () => {
    const user = userEvent.setup()
    render(<RecipesRoute />)

    await user.click(await screen.findByRole('button', { name: 'Nova receita' }))
    expect(screen.getByRole('heading', { name: 'Nova receita' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Sobremesas')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Título'), 'Nova receita offline')
    await user.click(screen.getByLabelText('Sobremesas'))
    await user.click(screen.getByRole('button', { name: 'Salvar receita' }))

    await waitFor(() => expect(fakes.createRecipe).toHaveBeenCalledTimes(1))
    const savedId = fakes.createRecipe.mock.calls[0]?.[0].id
    expect(savedId).toMatch(/^[0-9a-f-]{36}$/i)
    expect(fakes.setRecipeCategories).toHaveBeenCalledWith(savedId, [categoryId])
    expect(fakes.getRecipe).toHaveBeenCalledWith(savedId)
  })

  it('subscribes to database changes so remote replication refreshes the local library', async () => {
    render(<RecipesRoute />)
    await screen.findByRole('button', { name: /Abrir Bolo simples/ })

    expect(fakes.registerListener).toHaveBeenCalledTimes(1)
    const listener = fakes.registerListener.mock.calls[0]?.[0]
    fakes.listRecipes.mockResolvedValue([{ ...summary, title: 'Bolo sincronizado' }])
    listener?.crudUpdate()

    expect(await screen.findByRole('button', { name: /Abrir Bolo sincronizado/ })).toBeInTheDocument()
  })
})
