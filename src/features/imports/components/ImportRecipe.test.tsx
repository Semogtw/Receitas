import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ImportClient } from '../data/import-client'
import { ImportRecipe } from './ImportRecipe'

function clientWith(payload: unknown) {
  return new ImportClient({
    functions: {
      invoke: vi.fn(async () => ({ data: payload, error: null })),
    },
  })
}

describe('ImportRecipe', () => {
  it('submits URL import through the server client and opens review', async () => {
    const user = userEvent.setup()
    const onPreview = vi.fn()
    const client = clientWith({
      finalUrl: 'https://example.com/bolo',
      jsonLd: [JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Recipe',
        name: 'Bolo seguro',
        recipeIngredient: ['2 xícaras de farinha'],
        recipeInstructions: ['Misture.'],
      })],
      text: 'fallback',
    })

    render(<ImportRecipe client={client} onPreview={onPreview} onCancel={vi.fn()} />)
    await user.type(screen.getByLabelText('Endereço da página'), 'https://example.com/bolo')
    await user.click(screen.getByRole('button', { name: 'Revisar importação' }))

    expect(onPreview).toHaveBeenCalledTimes(1)
    expect(onPreview.mock.calls[0]?.[0]).toMatchObject({
      strategy: 'schema_org',
      draft: { title: 'Bolo seguro', sourceUrl: 'https://example.com/bolo' },
    })
  })

  it('parses pasted text locally after switching modes', async () => {
    const user = userEvent.setup()
    const onPreview = vi.fn()
    const client = clientWith(null)

    render(<ImportRecipe client={client} onPreview={onPreview} onCancel={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: 'Colar texto' }))
    await user.type(screen.getByLabelText('Texto da receita'), 'Pão rápido\n\nIngredientes\n1 xícara de farinha\n\nModo de preparo\nMisture tudo.')
    await user.click(screen.getByRole('button', { name: 'Revisar importação' }))

    expect(onPreview).toHaveBeenCalledTimes(1)
    expect(onPreview.mock.calls[0]?.[0]).toMatchObject({
      strategy: 'pasted_text',
      draft: { title: 'Pão rápido' },
    })
  })

  it('offers pasted text fallback after a remote import error', async () => {
    const user = userEvent.setup()
    const client = new ImportClient({
      functions: {
        invoke: vi.fn(async () => ({ data: null, error: { message: 'failed' } })),
      },
    })

    render(<ImportRecipe client={client} onPreview={vi.fn()} onCancel={vi.fn()} />)
    await user.type(screen.getByLabelText('Endereço da página'), 'https://example.com/bolo')
    await user.click(screen.getByRole('button', { name: 'Revisar importação' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Você pode colar o texto da receita')
  })
})
