import type { PowerSyncDatabase } from '@powersync/web'
import { CookingRepository } from '../../cooking/data/cooking-repository'
import { PhotoReadRepository } from '../../media/data/photo-read-repository'
import { CategoryRepository } from '../../recipes/data/category-repository'
import { ConversionProfileRepository } from '../../recipes/data/conversion-profile-repository'
import { RecipeRepository, type RecipeRepositoryScope } from '../../recipes/data/recipe-repository'
import type { PortableBackupRecipe, PortableBackupV1 } from '../domain/portable-backup'

function normalizedExportTimestamp(value: string | undefined): string {
  if (value === undefined) return new Date().toISOString()
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error('Backup export timestamp must be a normalized ISO timestamp')
  }
  return value
}

export async function exportPortableBackup(
  database: PowerSyncDatabase,
  scope: RecipeRepositoryScope,
  exportedAtInput?: string,
): Promise<PortableBackupV1> {
  const recipes = new RecipeRepository(database, scope)
  const categories = new CategoryRepository(database, scope)
  const conversions = new ConversionProfileRepository(database, scope)
  const cooking = new CookingRepository(database, scope)
  const photos = new PhotoReadRepository(database, scope.pairId)

  const [summaries, categoryRows, conversionProfiles] = await Promise.all([
    recipes.listRecipes(),
    categories.listCategories(),
    conversions.listDensityProfiles(),
  ])

  const recipeEntries = await Promise.all(summaries.map(async (summary): Promise<PortableBackupRecipe> => {
    const [recipe, categoryIds, history, recipePhotos] = await Promise.all([
      recipes.getRecipe(summary.id),
      categories.listRecipeCategoryIds(summary.id),
      cooking.listRecipeHistory(summary.id),
      photos.listRecipePhotos(summary.id),
    ])

    if (!recipe) {
      throw new Error(`Recipe ${summary.id} changed during backup; retry to avoid a partial archive`)
    }

    const sessionPhotoEntries = await Promise.all(history.map(async (session) => [
      session.id,
      await photos.listCookingSessionPhotos(session.id),
    ] as const))

    return {
      recipe,
      categoryIds: [...categoryIds].sort(),
      history,
      photos: recipePhotos,
      sessionPhotos: Object.fromEntries(sessionPhotoEntries),
    }
  }))

  return {
    format: 'receitas-portable-backup',
    version: 1,
    scope: 'active-shared-data',
    exportedAt: normalizedExportTimestamp(exportedAtInput),
    sourcePairId: scope.pairId,
    categories: [...categoryRows].sort((a, b) => a.id.localeCompare(b.id)),
    conversionProfiles: [...conversionProfiles],
    recipes: recipeEntries.sort((a, b) => a.recipe.id.localeCompare(b.recipe.id)),
  }
}
