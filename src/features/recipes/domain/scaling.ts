import { divideRational, multiplyRational, normalizeRational } from './amount'
import type { Rational, RecipeIngredient } from './types'

export function scaleIngredient(item: RecipeIngredient, multiplier: Rational): RecipeIngredient {
  if (item.amount.kind !== 'numeric') return item

  return {
    ...item,
    amount: {
      kind: 'numeric',
      value: multiplyRational(item.amount.value, multiplier),
    },
  }
}

export function scaleRecipeIngredients(
  ingredients: readonly RecipeIngredient[],
  multiplier: Rational,
): RecipeIngredient[] {
  return ingredients.map((ingredient) => scaleIngredient(ingredient, multiplier))
}

export function servingMultiplier(targetServings: Rational, sourceServings: Rational): Rational {
  const source = normalizeRational(sourceServings)
  if (source.numerator <= 0) throw new Error('Source servings must be greater than zero')

  const target = normalizeRational(targetServings)
  if (target.numerator < 0) throw new Error('Target servings must not be negative')
  return divideRational(target, source)
}
