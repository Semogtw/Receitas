export interface RecipeSearchQuery {
  text: string
  categoryIds: string[]
  favorite: boolean | null
  wantToMake: boolean | null
  alreadyMade: boolean | null
  sort: 'recent' | 'name' | 'most_prepared' | 'best_rated'
}

export interface RecipeSearchResult {
  recipeId: string
  title: string
  coverPhotoId: string | null
  favorite: boolean
  wantToMake: boolean
  alreadyMade: boolean
  preparationCount: number
  averageRating: number | null
  updatedAt: string
}

export interface RecipeSearchDocument extends RecipeSearchResult {
  description: string | null
  ingredientNames: string[]
  categoryIds: string[]
  categoryNames: string[]
  notes: string[]
}

export const EMPTY_RECIPE_SEARCH_QUERY: RecipeSearchQuery = {
  text: '',
  categoryIds: [],
  favorite: null,
  wantToMake: null,
  alreadyMade: null,
  sort: 'recent',
}

const portugueseCollator = new Intl.Collator('pt-BR', {
  sensitivity: 'base',
  numeric: true,
  usage: 'sort',
})

export function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function searchableText(document: RecipeSearchDocument): string {
  return normalizeSearchText([
    document.title,
    document.description ?? '',
    ...document.ingredientNames,
    ...document.categoryNames,
    ...document.notes,
  ].join(' '))
}

function matchesBooleanFilter(value: boolean, filter: boolean | null): boolean {
  return filter === null || value === filter
}

export function matchesRecipeSearch(document: RecipeSearchDocument, query: RecipeSearchQuery): boolean {
  const tokens = normalizeSearchText(query.text).split(' ').filter(Boolean)
  if (tokens.length > 0) {
    const haystack = searchableText(document)
    if (!tokens.every((token) => haystack.includes(token))) return false
  }

  // Multiple selected categories are conjunctive: every active category filter
  // must belong to the recipe, matching the "all active criteria" rule.
  if (query.categoryIds.length > 0) {
    const categories = new Set(document.categoryIds)
    if (!query.categoryIds.every((categoryId) => categories.has(categoryId))) return false
  }

  return matchesBooleanFilter(document.favorite, query.favorite)
    && matchesBooleanFilter(document.wantToMake, query.wantToMake)
    && matchesBooleanFilter(document.alreadyMade, query.alreadyMade)
}

function compareNullableRatingDescending(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0
  if (left === null) return 1
  if (right === null) return -1
  return right - left
}

function compareUpdatedDescending(left: RecipeSearchDocument, right: RecipeSearchDocument): number {
  const byUpdated = right.updatedAt.localeCompare(left.updatedAt)
  return byUpdated || portugueseCollator.compare(left.title, right.title)
}

export function sortRecipeSearchDocuments(
  documents: readonly RecipeSearchDocument[],
  sort: RecipeSearchQuery['sort'],
): RecipeSearchDocument[] {
  return [...documents].sort((left, right) => {
    if (sort === 'name') {
      return portugueseCollator.compare(left.title, right.title)
        || right.updatedAt.localeCompare(left.updatedAt)
    }
    if (sort === 'most_prepared') {
      return right.preparationCount - left.preparationCount
        || compareNullableRatingDescending(left.averageRating, right.averageRating)
        || portugueseCollator.compare(left.title, right.title)
    }
    if (sort === 'best_rated') {
      return compareNullableRatingDescending(left.averageRating, right.averageRating)
        || right.preparationCount - left.preparationCount
        || portugueseCollator.compare(left.title, right.title)
    }
    return compareUpdatedDescending(left, right)
  })
}

export function searchRecipeDocuments(
  documents: readonly RecipeSearchDocument[],
  query: RecipeSearchQuery,
): RecipeSearchResult[] {
  return sortRecipeSearchDocuments(
    documents.filter((document) => matchesRecipeSearch(document, query)),
    query.sort,
  ).map(({ recipeId, title, coverPhotoId, favorite, wantToMake, alreadyMade, preparationCount, averageRating, updatedAt }) => ({
    recipeId,
    title,
    coverPhotoId,
    favorite,
    wantToMake,
    alreadyMade,
    preparationCount,
    averageRating,
    updatedAt,
  }))
}
