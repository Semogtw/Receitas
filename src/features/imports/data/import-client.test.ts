import { describe, expect, it, vi } from 'vitest'
import { ImportClient, ImportClientError, type ImportFunctionsClient } from './import-client'

function fakeFunctionsClient(result: { data: unknown; error: { message: string } | null }): ImportFunctionsClient {
  return {
    functions: {
      invoke: vi.fn(async () => result),
    },
  }
}

describe('ImportClient', () => {
  it('routes URL imports through the Edge Function and prefers valid Recipe JSON-LD', async () => {
    const clientApi = fakeFunctionsClient({
      data: {
        finalUrl: 'https://example.test/bolo',
        jsonLd: [JSON.stringify({
          '@type': 'Recipe',
          name: 'Bolo remoto',
          recipeIngredient: ['2 ovos'],
          recipeInstructions: ['Misture.'],
        })],
        text: 'Fallback não deve ganhar do JSON-LD.',
      },
      error: null,
    })
    const client = new ImportClient(clientApi)

    const result = await client.importFromUrl('https://example.test/bolo')

    expect(clientApi.functions.invoke).toHaveBeenCalledWith('import-url', {
      body: { url: 'https://example.test/bolo' },
    })
    expect(result.strategy).toBe('schema_org')
    expect(result.draft).toMatchObject({
      title: 'Bolo remoto',
      sourceUrl: 'https://example.test/bolo',
      ingredients: [{ raw: '2 ovos' }],
      steps: [{ instruction: 'Misture.' }],
    })
  })

  it('falls back to the sanitized text payload when no Recipe JSON-LD is valid', async () => {
    const client = new ImportClient(fakeFunctionsClient({
      data: {
        finalUrl: 'https://example.test/panqueca',
        jsonLd: ['{"@type":"Article","name":"Página"}'],
        text: 'Panqueca\nIngredientes\n2 ovos\nPreparo\nMisture tudo.',
      },
      error: null,
    }))

    const result = await client.importFromUrl('https://example.test/panqueca')

    expect(result.strategy).toBe('text_fallback')
    expect(result.draft.title).toBe('Panqueca')
    expect(result.draft.sourceUrl).toBe('https://example.test/panqueca')
    expect(result.draft.warnings).toContain('Nenhum Recipe JSON-LD válido foi encontrado; a prévia usa o texto da página.')
  })

  it('parses pasted text directly without invoking any remote function', () => {
    const clientApi = fakeFunctionsClient({ data: null, error: null })
    const client = new ImportClient(clientApi)

    const result = client.importFromText('Molho\nIngredientes\nsal a gosto\nPreparo\nMisture.')

    expect(result.strategy).toBe('pasted_text')
    expect(result.draft.title).toBe('Molho')
    expect(clientApi.functions.invoke).not.toHaveBeenCalled()
  })

  it('rejects malformed server payloads instead of guessing their shape', async () => {
    const client = new ImportClient(fakeFunctionsClient({
      data: { finalUrl: 'javascript:alert(1)', jsonLd: 'not-an-array', text: 42 },
      error: null,
    }))

    await expect(client.importFromUrl('https://example.test/')).rejects.toMatchObject({
      code: 'invalid_server_payload',
    })
  })

  it('maps Edge Function invocation failures to a stable import error', async () => {
    const client = new ImportClient(fakeFunctionsClient({
      data: null,
      error: { message: 'FunctionsHttpError: 429' },
    }))

    await expect(client.importFromUrl('https://example.test/')).rejects.toBeInstanceOf(ImportClientError)
  })

  it('validates URL input before invoking the server', async () => {
    const api = fakeFunctionsClient({ data: null, error: null })
    const client = new ImportClient(api)

    await expect(client.importFromUrl('   ')).rejects.toMatchObject({ code: 'invalid_url' })
    expect(api.functions.invoke).not.toHaveBeenCalled()
  })
})
