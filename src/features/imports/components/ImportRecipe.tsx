import { useState, type FormEvent } from 'react'
import type { ImportClient, ImportPreview } from '../data/import-client'

interface ImportRecipeProps {
  client: ImportClient
  onPreview: (preview: ImportPreview) => void
  onCancel: () => void
}

type ImportMode = 'url' | 'text'

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message === 'invalid_url') return 'Informe um endereço http(s) válido, sem usuário ou senha na URL.'
  if (error instanceof Error && error.message === 'remote_import_failed') return 'Não foi possível ler essa página com segurança. Você pode colar o texto da receita.'
  if (error instanceof Error && error.message === 'invalid_server_payload') return 'A página respondeu em um formato inesperado. Você pode colar o texto da receita.'
  return 'Não foi possível preparar essa importação agora.'
}

export function ImportRecipe({ client, onPreview, onCancel }: ImportRecipeProps) {
  const [mode, setMode] = useState<ImportMode>('url')
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (mode === 'text') {
      if (!text.trim()) {
        setError('Cole o texto da receita antes de continuar.')
        return
      }
      onPreview(client.importFromText(text))
      return
    }

    setLoading(true)
    try {
      onPreview(await client.importFromUrl(url))
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="import-card" aria-labelledby="import-recipe-title">
      <header>
        <p className="route-kicker">Importar para o caderno</p>
        <h1 id="import-recipe-title">Importar receita</h1>
        <p className="route-intro">A importação sempre abre uma revisão editável antes de qualquer receita ser salva.</p>
      </header>

      <div className="import-tabs" role="tablist" aria-label="Origem da receita">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'url'}
          className="button button--quiet"
          data-selected={mode === 'url' || undefined}
          onClick={() => { setMode('url'); setError(null) }}
        >
          Link da receita
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'text'}
          className="button button--quiet"
          data-selected={mode === 'text' || undefined}
          onClick={() => { setMode('text'); setError(null) }}
        >
          Colar texto
        </button>
      </div>

      <form className="import-form" onSubmit={(event) => void submit(event)}>
        {mode === 'url' ? (
          <label className="field-stack">
            Endereço da página
            <input
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://exemplo.com/receita"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              disabled={loading}
            />
            <small>O servidor lê somente páginas públicas http(s), aplica limites de segurança e não envia seus cookies ao site.</small>
          </label>
        ) : (
          <label className="field-stack">
            Texto da receita
            <textarea
              rows={14}
              placeholder={'Bolo simples\n\nIngredientes\n2 xícaras de farinha\n...\n\nModo de preparo\n1. Misture...'}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <small>O texto colado é analisado no próprio dispositivo e pode ficar parcialmente estruturado para revisão.</small>
          </label>
        )}

        {error ? <p className="auth-error" role="alert">{error}</p> : null}

        <div className="import-form__actions">
          <button type="button" className="button button--quiet" onClick={onCancel} disabled={loading}>Cancelar</button>
          <button type="submit" className="button button--primary" disabled={loading}>
            {loading ? 'Lendo página…' : 'Revisar importação'}
          </button>
        </div>
      </form>
    </section>
  )
}
