import type { IngredientAmount } from '../../recipes/domain/types'

export interface ShoppingSource {
  kind: 'manual' | 'recipe' | 'planner'
  recipeId?: string
  mealPlanEntryId?: string
}

export interface ShoppingItemDraft {
  name: string
  normalizedName: string
  amount: IngredientAmount
  unit: string | null
  source: ShoppingSource
}

export interface ShoppingList {
  id: string
  pairId: string
  name: string
  isDefault: boolean
  revision: number
  deletedAt: string | null
}

export interface ShoppingItem extends ShoppingItemDraft {
  id: string
  listId: string
  pairId: string
  purchased: boolean
  revision: number
  deletedAt: string | null
}

export type ShoppingItemPatch = Partial<
  Pick<ShoppingItem, 'name' | 'normalizedName' | 'amount' | 'unit' | 'purchased'>
>

export interface ShoppingRepositoryScope {
  pairId: string
  actorUserId: string
}

export interface ConsolidatedShoppingItem extends ShoppingItemDraft {
  sources: ShoppingSource[]
  approximate: boolean
}
