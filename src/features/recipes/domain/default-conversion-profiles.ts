import type { ConversionProfile } from './types'

/**
 * Deliberately tiny built-in density catalog.
 *
 * Water is the only default whose 1 g/mL culinary approximation is sufficiently
 * unsurprising to ship without pretending that ingredient density is universal.
 * Other ingredients should come from an explicit pair override or a future
 * curated, source-documented addition.
 */
export const DEFAULT_CONVERSION_PROFILES: readonly ConversionProfile[] = [
  {
    ingredientKey: 'agua',
    gramsPerMilliliter: 1,
    source: 'default',
  },
]
