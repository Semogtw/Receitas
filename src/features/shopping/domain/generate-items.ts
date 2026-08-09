import { scaleRecipeIngredients, servingMultiplier } from '../../recipes/domain/scaling'
import type { Rational, RecipeIngredient } from '../../recipes/domain/types'
import type { ShoppingItemDraft, ShoppingSource } from './types'

export interface ShoppingRecipeSelection {
  recipeId: string
  ingredients: readonly RecipeIngredient[]
  baseServings: Rational | null
  requestedServings?: Rational | null
  source: ShoppingSource
}

function ingredientDisplayName(ingredient: RecipeIngredient): string {
  const note = ingredient.note?.trim()
  return note ? `${ingredient.name} — ${note}` : ingredient.name
}

function scaledIngredients(selection: ShoppingRecipeSelection): readonly RecipeIngredient[] {
  if (selection.requestedServings === undefined || selection.requestedServings === null) {
    return selection.ingredients
  }
  if (selection.baseServings === null) {
    throw new Error('Cannot scale a recipe without base servings')
  }
  return scaleRecipeIngredients(
    selection.ingredients,
    servingMultiplier(selection.requestedServings, selection.baseServings),
  )
}

export function generateShoppingItems(
  selections: readonly ShoppingRecipeSelection[],
): ShoppingItemDraft[] {
  return selections.flatMap((selection) => {
    if (!selection.recipeId) throw new Error('Shopping recipe selection requires recipeId')
    if (selection.source.kind === 'recipe' && selection.source.recipeId !== selection.recipeId) {
      throw new Error('Recipe shopping source must reference the selected recipe')
    }
    if (selection.source.kind === 'planner' && !selection.source.mealPlanEntryId) {
      throw new Error('Planner shopping source requires mealPlanEntryId')
    }

    return scaledIngredients(selection).map((ingredient) => ({
      name: ingredientDisplayName(ingredient),
      normalizedName: ingredient.normalizedName,
      amount: ingredient.amount,
      unit: ingredient.unit,
      source: selection.source,
    }))
  })
}
