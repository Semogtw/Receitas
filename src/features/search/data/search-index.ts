import type { PowerSyncDatabase } from '@powersync/web'
import {
  searchRecipeDocuments,
  type RecipeSearchDocument,
  type RecipeSearchQuery,
  type RecipeSearchResult,
} from '../domain/search'

interface RecipeRow {
  id: string
  title: string
  description: string | null
  favorite: number
  want_to_make: number
  updated_at: string
}

interface IngredientRow {
  recipe_id: string
  ingredient_name: string
  note: string | null
}

interface CategoryRow {
  recipe_id: string
  category_id: string
  category_name: string
}

interface NoteRow {
  recipe_id: string
  observation: string | null
}

interface SessionRow {
  id: string
  recipe_id: string
}

interface RatingRow {
  recipe_id: string
  score: number
}

interface PhotoRow {
  id: string
  recipe_id: string
  is_cover: number
  position: number
}

function pushMapValue<T>(map: Map<string, T[]>, key: string, value: T): void {
  const values = map.get(key)
  if (values) values.push(value)
  else map.set(key, [value])
}

export class LocalRecipeSearch {
  constructor(
    private readonly database: PowerSyncDatabase,
    private readonly pairId: string,
  ) {}

  async searchRecipes(query: RecipeSearchQuery): Promise<RecipeSearchResult[]> {
    const documents = await this.loadDocuments()
    return searchRecipeDocuments(documents, query)
  }

  async loadDocuments(): Promise<RecipeSearchDocument[]> {
    const [recipes, ingredients, categories, notes, sessions, ratings, photos] = await Promise.all([
      this.database.getAll<RecipeRow>(
        `SELECT id, title, description, favorite, want_to_make, updated_at
           FROM recipes
          WHERE pair_id = ? AND deleted_at IS NULL`,
        [this.pairId],
      ),
      this.database.getAll<IngredientRow>(
        `SELECT recipe_id, ingredient_name, note
           FROM recipe_ingredients
          WHERE pair_id = ? AND deleted_at IS NULL
          ORDER BY recipe_id, position`,
        [this.pairId],
      ),
      this.database.getAll<CategoryRow>(
        `SELECT rc.recipe_id, rc.category_id, c.name AS category_name
           FROM recipe_categories rc
           JOIN categories c
             ON c.id = rc.category_id
            AND c.pair_id = rc.pair_id
            AND c.deleted_at IS NULL
          WHERE rc.pair_id = ? AND rc.deleted_at IS NULL
          ORDER BY rc.recipe_id, c.name COLLATE NOCASE`,
        [this.pairId],
      ),
      this.database.getAll<NoteRow>(
        `SELECT recipe_id, observation
           FROM recipe_steps
          WHERE pair_id = ? AND deleted_at IS NULL AND observation IS NOT NULL
          ORDER BY recipe_id, position`,
        [this.pairId],
      ),
      this.database.getAll<SessionRow>(
        `SELECT id, recipe_id
           FROM cooking_sessions
          WHERE pair_id = ? AND deleted_at IS NULL`,
        [this.pairId],
      ),
      this.database.getAll<RatingRow>(
        `SELECT s.recipe_id, r.score
           FROM cooking_session_ratings r
           JOIN cooking_sessions s
             ON s.id = r.cooking_session_id
            AND s.pair_id = r.pair_id
            AND s.deleted_at IS NULL
          WHERE r.pair_id = ? AND r.deleted_at IS NULL`,
        [this.pairId],
      ),
      this.database.getAll<PhotoRow>(
        `SELECT id, recipe_id, is_cover, position
           FROM recipe_photos
          WHERE pair_id = ? AND deleted_at IS NULL
          ORDER BY recipe_id, is_cover DESC, position ASC, created_at ASC`,
        [this.pairId],
      ),
    ])

    const ingredientNames = new Map<string, string[]>()
    const searchNotes = new Map<string, string[]>()
    for (const ingredient of ingredients) {
      pushMapValue(ingredientNames, ingredient.recipe_id, ingredient.ingredient_name)
      if (ingredient.note?.trim()) pushMapValue(searchNotes, ingredient.recipe_id, ingredient.note)
    }
    for (const step of notes) {
      if (step.observation?.trim()) pushMapValue(searchNotes, step.recipe_id, step.observation)
    }

    const categoryIds = new Map<string, string[]>()
    const categoryNames = new Map<string, string[]>()
    for (const category of categories) {
      pushMapValue(categoryIds, category.recipe_id, category.category_id)
      pushMapValue(categoryNames, category.recipe_id, category.category_name)
    }

    const preparationCounts = new Map<string, number>()
    for (const session of sessions) {
      preparationCounts.set(session.recipe_id, (preparationCounts.get(session.recipe_id) ?? 0) + 1)
    }

    const ratingScores = new Map<string, number[]>()
    for (const rating of ratings) pushMapValue(ratingScores, rating.recipe_id, Number(rating.score))

    const coverPhotos = new Map<string, string>()
    for (const photo of photos) {
      if (!coverPhotos.has(photo.recipe_id)) coverPhotos.set(photo.recipe_id, photo.id)
    }

    return recipes.map((recipe) => {
      const scores = ratingScores.get(recipe.id) ?? []
      const preparationCount = preparationCounts.get(recipe.id) ?? 0
      return {
        recipeId: recipe.id,
        title: recipe.title,
        coverPhotoId: coverPhotos.get(recipe.id) ?? null,
        favorite: Number(recipe.favorite) === 1,
        wantToMake: Number(recipe.want_to_make) === 1,
        alreadyMade: preparationCount > 0,
        preparationCount,
        averageRating: scores.length > 0
          ? scores.reduce((total, score) => total + score, 0) / scores.length
          : null,
        updatedAt: recipe.updated_at,
        description: recipe.description,
        ingredientNames: ingredientNames.get(recipe.id) ?? [],
        categoryIds: categoryIds.get(recipe.id) ?? [],
        categoryNames: categoryNames.get(recipe.id) ?? [],
        notes: searchNotes.get(recipe.id) ?? [],
      }
    })
  }
}
