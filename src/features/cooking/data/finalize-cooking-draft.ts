import type { RecipeAggregate } from '../../recipes/data/recipe-repository'
import type { CookingDraft } from '../domain/cooking-draft'
import type { FinishCookingValue } from '../components/FinishCooking'
import type { CreateCookingSessionInput } from './cooking-repository'

interface CookingSessionCreator {
  createCookingSession(input: CreateCookingSessionInput): Promise<string>
}

interface CookingDraftClearer {
  clear(): Promise<void>
}

function snapshotAsRecipeAggregate(draft: CookingDraft): RecipeAggregate {
  const snapshot = draft.recipeSnapshot
  return {
    id: snapshot.recipeId,
    revision: snapshot.recipeRevision,
    title: snapshot.title,
    description: snapshot.description,
    favorite: false,
    wantToMake: false,
    baseYield: snapshot.baseYield ? { ...snapshot.baseYield } : null,
    baseYieldUnit: snapshot.baseYieldUnit,
    prepTimeSeconds: snapshot.prepTimeSeconds,
    cookTimeSeconds: snapshot.cookTimeSeconds,
    totalTimeSeconds: snapshot.totalTimeSeconds,
    updatedAt: draft.startedAt,
    ingredients: snapshot.ingredients.map((ingredient) => ({
      ...ingredient,
      amount: ingredient.amount.kind === 'numeric'
        ? { kind: 'numeric' as const, value: { ...ingredient.amount.value } }
        : ingredient.amount.kind === 'text'
          ? { kind: 'text' as const, text: ingredient.amount.text }
          : { kind: 'none' as const },
      recipeId: snapshot.recipeId,
    })),
    steps: snapshot.steps.map((step) => ({
      ...step,
      recipeId: snapshot.recipeId,
    })),
  }
}

export async function finalizeCookingDraft(
  draft: CookingDraft,
  sessions: CookingSessionCreator,
  draftStore: CookingDraftClearer,
  value: FinishCookingValue,
): Promise<string> {
  const sessionId = await sessions.createCookingSession({
    id: draft.finalizationSessionId,
    recipe: snapshotAsRecipeAggregate(draft),
    startedAt: draft.startedAt,
    preparedYield: value.preparedYield,
    sharedObservation: value.sharedObservation,
  })

  await draftStore.clear()
  return sessionId
}
