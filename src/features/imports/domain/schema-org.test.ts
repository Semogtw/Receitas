import { describe, expect, it } from 'vitest'
import { parseSchemaOrgRecipeJsonLd } from './schema-org'

describe('parseSchemaOrgRecipeJsonLd', () => {
  it('parses a direct Schema.org Recipe with ingredients, steps and ISO durations', () => {
    const result = parseSchemaOrgRecipeJsonLd(JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Bolo de cenoura',
      description: 'Bolo simples',
      recipeYield: '8 porções',
      prepTime: 'PT15M',
      cookTime: 'PT40M',
      recipeIngredient: ['2 cenouras', '1 xícara de açúcar'],
      recipeInstructions: [
        'Bata os líquidos.',
        { '@type': 'HowToStep', text: 'Misture os secos.' },
      ],
      image: { '@type': 'ImageObject', url: 'https://example.test/bolo.webp' },
    }), 'https://example.test/receita')

    expect(result).toMatchObject({
      title: 'Bolo de cenoura',
      description: 'Bolo simples',
      sourceUrl: 'https://example.test/receita',
      servings: '8 porções',
      prepTimeMinutes: 15,
      cookTimeMinutes: 40,
      imageUrl: 'https://example.test/bolo.webp',
      steps: [
        { instruction: 'Bata os líquidos.' },
        { instruction: 'Misture os secos.' },
      ],
    })
    expect(result?.ingredients).toEqual([
      {
        raw: '2 cenouras',
        parsed: {
          amount: { kind: 'numeric', value: { numerator: 2, denominator: 1 } },
          unit: null,
          name: 'cenouras',
          note: null,
        },
      },
      {
        raw: '1 xícara de açúcar',
        parsed: {
          amount: { kind: 'numeric', value: { numerator: 1, denominator: 1 } },
          unit: 'xícara',
          name: 'açúcar',
          note: null,
        },
      },
    ])
  })

  it('finds Recipe inside @graph and flattens HowToSection itemListElement', () => {
    const result = parseSchemaOrgRecipeJsonLd(JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', name: 'Página' },
        {
          '@type': ['Thing', 'Recipe'],
          name: 'Sopa',
          recipeIngredient: '1 l de água',
          recipeInstructions: {
            '@type': 'HowToSection',
            name: 'Preparo',
            itemListElement: [
              { '@type': 'HowToStep', text: 'Ferva a água.' },
              { '@type': 'HowToStep', name: 'Sirva quente.' },
            ],
          },
        },
      ],
    }))

    expect(result?.title).toBe('Sopa')
    expect(result?.ingredients).toHaveLength(1)
    expect(result?.steps).toEqual([
      { instruction: 'Ferva a água.' },
      { instruction: 'Sirva quente.' },
    ])
  })

  it('uses the first usable yield and image from array-shaped Schema.org fields', () => {
    const result = parseSchemaOrgRecipeJsonLd(JSON.stringify({
      '@type': 'Recipe',
      name: 'Massa',
      recipeYield: [null, '4 pratos'],
      image: [
        { '@type': 'ImageObject', contentUrl: 'https://example.test/massa.jpg' },
        'https://example.test/secondary.jpg',
      ],
    }))

    expect(result?.servings).toBe('4 pratos')
    expect(result?.imageUrl).toBe('https://example.test/massa.jpg')
  })

  it('returns null for malformed JSON-LD or values without a Recipe node', () => {
    expect(parseSchemaOrgRecipeJsonLd('{not-json')).toBeNull()
    expect(parseSchemaOrgRecipeJsonLd(JSON.stringify({ '@type': 'Article', name: 'Texto' }))).toBeNull()
  })

  it('treats script-like strings as inert data and never evaluates them', () => {
    ;(globalThis as Record<string, unknown>).__recipeImportExecuted = false
    const dangerous = '</script><script>globalThis.__recipeImportExecuted=true</script>'
    const result = parseSchemaOrgRecipeJsonLd(JSON.stringify({
      '@type': 'Recipe',
      name: dangerous,
      recipeInstructions: [dangerous],
    }))

    expect(result?.title).toBe(dangerous)
    expect(result?.steps).toEqual([{ instruction: dangerous }])
    expect((globalThis as Record<string, unknown>).__recipeImportExecuted).toBe(false)
    delete (globalThis as Record<string, unknown>).__recipeImportExecuted
  })

  it('keeps missing optional fields null and warns about absent core content', () => {
    const result = parseSchemaOrgRecipeJsonLd(JSON.stringify({ '@type': 'Recipe', name: 'Só o nome' }))

    expect(result).toMatchObject({
      title: 'Só o nome',
      description: null,
      servings: null,
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      ingredients: [],
      steps: [],
      imageUrl: null,
    })
    expect(result?.warnings).toContain('Nenhum ingrediente foi encontrado no JSON-LD.')
    expect(result?.warnings).toContain('Nenhuma etapa de preparo foi encontrada no JSON-LD.')
  })
})
