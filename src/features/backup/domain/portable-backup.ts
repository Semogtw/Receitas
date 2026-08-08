import type { CookingSessionSummary } from '../../cooking/domain/cooking-session'
import type { PhotoMetadata } from '../../media/data/photo-read-repository'
import type { RecipeCategory } from '../../recipes/data/category-repository'
import type { RecipeAggregate } from '../../recipes/data/recipe-repository'
import type { ConversionProfile } from '../../recipes/domain/types'

export interface PortableBackupRecipe {
  recipe: RecipeAggregate
  categoryIds: string[]
  history: CookingSessionSummary[]
  photos: PhotoMetadata[]
  sessionPhotos: Record<string, PhotoMetadata[]>
}

export interface PortableBackupV1 {
  format: 'receitas-portable-backup'
  version: 1
  scope: 'active-shared-data'
  exportedAt: string
  sourcePairId: string
  categories: RecipeCategory[]
  conversionProfiles: ConversionProfile[]
  recipes: PortableBackupRecipe[]
}

const ROOT_FIELDS = new Set([
  'format',
  'version',
  'scope',
  'exportedAt',
  'sourcePairId',
  'categories',
  'conversionProfiles',
  'recipes',
])

function objectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be non-empty text`)
  return value
}

function normalizedIsoTimestamp(value: unknown, label: string): string {
  const text = requiredString(value, label)
  const time = Date.parse(text)
  if (!Number.isFinite(time) || new Date(time).toISOString() !== text) {
    throw new Error(`${label} must be a normalized ISO timestamp`)
  }
  return text
}

function assertArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  return value
}

function assertUnique(ids: readonly string[], label: string): void {
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`Backup contains duplicate ${label} id: ${id}`)
    seen.add(id)
  }
}

function parseCategory(value: unknown): RecipeCategory {
  const row = objectRecord(value, 'Backup category')
  return {
    id: requiredString(row.id, 'Backup category id'),
    name: requiredString(row.name, 'Backup category name'),
  }
}

function parseRecipe(value: unknown): RecipeAggregate {
  const row = objectRecord(value, 'Backup recipe')
  const revision = row.revision
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) {
    throw new Error('Backup recipe revision must be a non-negative integer')
  }
  if (typeof row.favorite !== 'boolean' || typeof row.wantToMake !== 'boolean') {
    throw new Error('Backup recipe flags must be boolean')
  }
  assertArray(row.ingredients, 'Backup recipe ingredients')
  assertArray(row.steps, 'Backup recipe steps')
  normalizedIsoTimestamp(row.updatedAt, 'Backup recipe updatedAt')

  return row as unknown as RecipeAggregate
}

function parsePhoto(value: unknown): PhotoMetadata {
  const row = objectRecord(value, 'Backup photo')
  const position = row.position
  if (typeof position !== 'number' || !Number.isSafeInteger(position) || position < 0) {
    throw new Error('Backup photo position must be a non-negative integer')
  }
  if (!(row.caption === null || typeof row.caption === 'string')) {
    throw new Error('Backup photo caption must be text or null')
  }
  normalizedIsoTimestamp(row.createdAt, 'Backup photo createdAt')
  return {
    id: requiredString(row.id, 'Backup photo id'),
    storagePath: requiredString(row.storagePath, 'Backup photo storage path'),
    position,
    caption: row.caption as string | null,
    createdAt: row.createdAt as string,
  }
}

function parseHistory(value: unknown): CookingSessionSummary {
  const row = objectRecord(value, 'Backup cooking session')
  requiredString(row.id, 'Backup cooking session id')
  requiredString(row.recipeId, 'Backup cooking session recipe id')
  requiredString(row.recordedBy, 'Backup cooking session recorder')
  normalizedIsoTimestamp(row.preparedAt, 'Backup cooking session preparedAt')
  objectRecord(row.snapshot, 'Backup cooking session snapshot')
  assertArray(row.ratings, 'Backup cooking session ratings')
  if (!(row.averageScore === null || (typeof row.averageScore === 'number' && Number.isFinite(row.averageScore)))) {
    throw new Error('Backup cooking session averageScore must be numeric or null')
  }
  return row as unknown as CookingSessionSummary
}

function parseRecipeEntry(value: unknown): PortableBackupRecipe {
  const row = objectRecord(value, 'Backup recipe entry')
  const recipe = parseRecipe(row.recipe)
  const categoryIds = assertArray(row.categoryIds, 'Backup recipe categoryIds').map((item) => requiredString(item, 'Backup category reference'))
  assertUnique(categoryIds, 'category reference')
  const history = assertArray(row.history, 'Backup recipe history').map(parseHistory)
  assertUnique(history.map((session) => session.id), 'cooking session')
  for (const session of history) {
    if (session.recipeId !== recipe.id) {
      throw new Error(`Cooking session ${session.id} does not belong to backup recipe ${recipe.id}`)
    }
  }

  const photos = assertArray(row.photos, 'Backup recipe photos').map(parsePhoto)
  assertUnique(photos.map((photo) => photo.id), 'recipe photo')

  const sessionPhotosRaw = objectRecord(row.sessionPhotos, 'Backup cooking session photos')
  const sessionIds = new Set(history.map((session) => session.id))
  const sessionPhotos: Record<string, PhotoMetadata[]> = {}
  const sessionPhotoIds: string[] = []
  for (const [sessionId, values] of Object.entries(sessionPhotosRaw)) {
    if (!sessionIds.has(sessionId)) {
      throw new Error(`Backup contains photos for unknown cooking session ${sessionId}`)
    }
    const parsed = assertArray(values, `Backup photos for cooking session ${sessionId}`).map(parsePhoto)
    sessionPhotos[sessionId] = parsed
    sessionPhotoIds.push(...parsed.map((photo) => photo.id))
  }
  assertUnique(sessionPhotoIds, 'cooking session photo')

  return { recipe, categoryIds, history, photos, sessionPhotos }
}

function parseConversionProfiles(value: unknown): ConversionProfile[] {
  return assertArray(value, 'Backup conversionProfiles').map((item) => {
    objectRecord(item, 'Backup conversion profile')
    return item as ConversionProfile
  })
}

export function parsePortableBackup(serialized: string): PortableBackupV1 {
  let raw: unknown
  try {
    raw = JSON.parse(serialized)
  } catch {
    throw new Error('Backup is not valid JSON')
  }
  const root = objectRecord(raw, 'Backup')
  for (const key of Object.keys(root)) {
    if (!ROOT_FIELDS.has(key)) throw new Error(`Backup contains unsupported root field: ${key}`)
  }
  if (root.format !== 'receitas-portable-backup') throw new Error('Unsupported backup format')
  if (root.version !== 1) throw new Error('Unsupported backup version')
  if (root.scope !== 'active-shared-data') throw new Error('Unsupported backup scope')

  const exportedAt = normalizedIsoTimestamp(root.exportedAt, 'Backup exportedAt timestamp')
  const sourcePairId = requiredString(root.sourcePairId, 'Backup source pair')
  const categories = assertArray(root.categories, 'Backup categories').map(parseCategory)
  assertUnique(categories.map((category) => category.id), 'category')
  const categoryIds = new Set(categories.map((category) => category.id))

  const recipes = assertArray(root.recipes, 'Backup recipes').map(parseRecipeEntry)
  assertUnique(recipes.map((entry) => entry.recipe.id), 'recipe')
  for (const entry of recipes) {
    for (const categoryId of entry.categoryIds) {
      if (!categoryIds.has(categoryId)) {
        throw new Error(`Backup recipe ${entry.recipe.id} references unknown category ${categoryId}`)
      }
    }
  }

  const cookingSessionIds = recipes.flatMap((entry) => entry.history.map((session) => session.id))
  assertUnique(cookingSessionIds, 'cooking session')
  const recipePhotoIds = recipes.flatMap((entry) => entry.photos.map((photo) => photo.id))
  assertUnique(recipePhotoIds, 'recipe photo')

  return {
    format: 'receitas-portable-backup',
    version: 1,
    scope: 'active-shared-data',
    exportedAt,
    sourcePairId,
    categories,
    conversionProfiles: parseConversionProfiles(root.conversionProfiles),
    recipes,
  }
}

export function serializePortableBackup(backup: PortableBackupV1): string {
  const parsed = parsePortableBackup(JSON.stringify(backup))
  return `${JSON.stringify(parsed, null, 2)}\n`
}
