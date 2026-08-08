export type Rational = {
  numerator: number
  denominator: number
}

export type IngredientAmount =
  | { kind: 'numeric'; value: Rational }
  | { kind: 'text'; text: string }
  | { kind: 'none' }

export interface RecipeIngredient {
  id: string
  recipeId: string
  position: number
  amount: IngredientAmount
  unit: string | null
  name: string
  normalizedName: string
  note: string | null
  isApproximate: boolean
  isOptional: boolean
}

export interface RecipeStep {
  id: string
  recipeId: string
  position: number
  instruction: string
  durationSeconds: number | null
  note: string | null
}

export interface ConversionProfile {
  ingredientKey: string
  gramsPerMilliliter: number
  source: 'default' | 'pair_override'
}

export interface PersistedIngredientAmount {
  quantityNum: number | null
  quantityDen: number | null
  quantityText: string | null
}
