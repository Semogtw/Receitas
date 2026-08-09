import { describe, expect, it } from 'vitest'
import { parsePastedRecipeText } from './text-parser'

describe('parsePastedRecipeText', () => {
  it('parses explicit Portuguese ingredient and preparation sections', () => {
    const result = parsePastedRecipeText(`
Bolo simples
Um bolo para o café.

Ingredientes
2 ovos
1 xícara de açúcar
2 xícaras de farinha de trigo

Modo de preparo
Bata os ovos com o açúcar.
Misture a farinha.
Asse por 35 minutos.
`)

    expect(result.title).toBe('Bolo simples')
    expect(result.description).toBe('Um bolo para o café.')
    expect(result.ingredients.map((ingredient) => ingredient.raw)).toEqual([
      '2 ovos',
      '1 xícara de açúcar',
      '2 xícaras de farinha de trigo',
    ])
    expect(result.ingredients[1]?.parsed).toMatchObject({
      amount: { kind: 'numeric', value: { numerator: 1, denominator: 1 } },
      unit: 'xícara',
      name: 'açúcar',
    })
    expect(result.steps).toEqual([
      { instruction: 'Bata os ovos com o açúcar.' },
      { instruction: 'Misture a farinha.' },
      { instruction: 'Asse por 35 minutos.' },
    ])
  })

  it('accepts numbered and bulleted lines without retaining list markers', () => {
    const result = parsePastedRecipeText(`
Panqueca
INGREDIENTES:
- 1 1/2 xícaras de leite
• 2 ovos
PREPARO:
1. Misture tudo.
2) Doure dos dois lados.
`)

    expect(result.ingredients.map((ingredient) => ingredient.raw)).toEqual([
      '1 1/2 xícaras de leite',
      '2 ovos',
    ])
    expect(result.steps).toEqual([
      { instruction: 'Misture tudo.' },
      { instruction: 'Doure dos dois lados.' },
    ])
  })

  it('preserves unparseable ingredient lines raw for manual review', () => {
    const result = parsePastedRecipeText(`
Molho
Ingredientes
sal a gosto
um punhado generoso de manjericão
Preparo
Misture tudo.
`)

    expect(result.ingredients).toEqual([
      { raw: 'sal a gosto' },
      { raw: 'um punhado generoso de manjericão' },
    ])
    expect(result.warnings).toContain('2 ingredientes ficaram em formato bruto para revisão.')
  })

  it('returns a partial draft with warnings when sections are missing', () => {
    const result = parsePastedRecipeText('Brigadeiro\nMisture leite condensado e chocolate até desgrudar da panela.')

    expect(result.title).toBe('Brigadeiro')
    expect(result.ingredients).toEqual([])
    expect(result.steps).toEqual([])
    expect(result.description).toBe('Misture leite condensado e chocolate até desgrudar da panela.')
    expect(result.warnings).toContain('Seção de ingredientes não identificada; revise o conteúdo manualmente.')
    expect(result.warnings).toContain('Seção de preparo não identificada; revise o conteúdo manualmente.')
  })

  it('does not invent a title from an ingredient header', () => {
    const result = parsePastedRecipeText('Ingredientes\n2 ovos\n1 xícara de farinha')

    expect(result.title).toBeNull()
    expect(result.ingredients).toHaveLength(2)
    expect(result.warnings).toContain('Título não identificado no texto colado.')
  })

  it('ignores blank text while still returning a reviewable draft', () => {
    const result = parsePastedRecipeText('   \n\n ')

    expect(result).toMatchObject({
      title: null,
      description: null,
      ingredients: [],
      steps: [],
    })
    expect(result.warnings).toContain('Nenhum conteúdo útil foi encontrado no texto colado.')
  })
})
