import { describe, expect, it } from 'vitest'
import {
  EMPTY_RECIPE_SEARCH_QUERY,
  normalizeSearchText,
  searchRecipeDocuments,
  type RecipeSearchDocument,
  type RecipeSearchQuery,
} from './search'

function document(overrides: Partial<RecipeSearchDocument> = {}): RecipeSearchDocument {
  return {
    recipeId: '40000000-0000-4000-8000-000000000001',
    title: 'Bolo de cenoura',
    coverPhotoId: null,
    favorite: true,
    wantToMake: false,
    alreadyMade: true,
    preparationCount: 2,
    averageRating: 4.5,
    updatedAt: '2026-08-08T12:00:00.000Z',
    description: 'Bolo rápido com cobertura',
    ingredientNames: ['Cenoura', 'Farinha de trigo'],
    categoryIds: ['cat-doces', 'cat-rapido'],
    categoryNames: ['Sobremesas', 'Rápido'],
    notes: ['Cobertura opcional'],
    ...overrides,
  }
}

function query(overrides: Partial<RecipeSearchQuery> = {}): RecipeSearchQuery {
  return { ...EMPTY_RECIPE_SEARCH_QUERY, ...overrides }
}

describe('recipe search domain', () => {
  it('normalizes Portuguese accents, case and repeated whitespace only for comparison', () => {
    expect(normalizeSearchText('  PÃO   de AÇÚCAR ')).toBe('pao de acucar')
  })

  it('matches partial text across title, ingredients, categories and notes', () => {
    const recipe = document()
    expect(searchRecipeDocuments([recipe], query({ text: 'cenour' }))).toHaveLength(1)
    expect(searchRecipeDocuments([recipe], query({ text: 'trigo' }))).toHaveLength(1)
    expect(searchRecipeDocuments([recipe], query({ text: 'sobrem' }))).toHaveLength(1)
    expect(searchRecipeDocuments([recipe], query({ text: 'opcional' }))).toHaveLength(1)
  })

  it('requires every search token while allowing tokens to come from different fields', () => {
    expect(searchRecipeDocuments([document()], query({ text: 'bolo farinha rapido' }))).toHaveLength(1)
    expect(searchRecipeDocuments([document()], query({ text: 'bolo salgado' }))).toHaveLength(0)
  })

  it('treats multiple selected categories as conjunctive active criteria', () => {
    const recipes = [
      document({ recipeId: 'a', categoryIds: ['cat-doces', 'cat-rapido'] }),
      document({ recipeId: 'b', title: 'Outro bolo', categoryIds: ['cat-doces'] }),
    ]
    const results = searchRecipeDocuments(recipes, query({ categoryIds: ['cat-doces', 'cat-rapido'] }))
    expect(results.map((item) => item.recipeId)).toEqual(['a'])
  })

  it('combines category, favorite, want-to-make and already-made filters', () => {
    const recipes = [
      document({ recipeId: 'a', favorite: true, wantToMake: true, alreadyMade: false }),
      document({ recipeId: 'b', title: 'Bolo antigo', favorite: true, wantToMake: false, alreadyMade: false }),
      document({ recipeId: 'c', title: 'Bolo já feito', favorite: true, wantToMake: true, alreadyMade: true }),
    ]
    const results = searchRecipeDocuments(recipes, query({
      text: 'bolo',
      categoryIds: ['cat-doces'],
      favorite: true,
      wantToMake: true,
      alreadyMade: false,
    }))
    expect(results.map((item) => item.recipeId)).toEqual(['a'])
  })

  it('sorts names with Portuguese locale behavior', () => {
    const results = searchRecipeDocuments([
      document({ recipeId: 'z', title: 'Zabaione' }),
      document({ recipeId: 'a', title: 'Água de coco' }),
      document({ recipeId: 'b', title: 'Brigadeiro' }),
    ], query({ sort: 'name' }))
    expect(results.map((item) => item.title)).toEqual(['Água de coco', 'Brigadeiro', 'Zabaione'])
  })

  it('sorts most prepared from valid preparation counts', () => {
    const results = searchRecipeDocuments([
      document({ recipeId: 'a', preparationCount: 1 }),
      document({ recipeId: 'b', title: 'Muito feito', preparationCount: 7 }),
      document({ recipeId: 'c', title: 'Nunca feito', preparationCount: 0, alreadyMade: false }),
    ], query({ sort: 'most_prepared' }))
    expect(results.map((item) => item.recipeId)).toEqual(['b', 'a', 'c'])
  })

  it('places unrated recipes after rated recipes instead of treating them as zero', () => {
    const results = searchRecipeDocuments([
      document({ recipeId: 'none', title: 'Sem nota', averageRating: null, preparationCount: 99 }),
      document({ recipeId: 'low', title: 'Nota dois', averageRating: 2, preparationCount: 1 }),
      document({ recipeId: 'high', title: 'Nota cinco', averageRating: 5, preparationCount: 1 }),
    ], query({ sort: 'best_rated' }))
    expect(results.map((item) => item.recipeId)).toEqual(['high', 'low', 'none'])
  })

  it('uses recipe updatedAt consistently for recent ordering', () => {
    const results = searchRecipeDocuments([
      document({ recipeId: 'old', updatedAt: '2026-07-01T12:00:00.000Z' }),
      document({ recipeId: 'new', title: 'Mais nova', updatedAt: '2026-08-08T12:00:00.000Z' }),
    ], query({ sort: 'recent' }))
    expect(results.map((item) => item.recipeId)).toEqual(['new', 'old'])
  })
})
