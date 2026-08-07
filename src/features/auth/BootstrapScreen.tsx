import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { getSupabaseClient } from '../../lib/supabase/client'

export function BootstrapScreen() {
  const [email, setEmail] = useState('')
  const [secret, setSecret] = useState('')
  const [mode, setMode] = useState<'start' | 'reinvite'>('start')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true); setError(null); setMessage(null)
    try {
      const { error: invokeError } = await getSupabaseClient().functions.invoke('bootstrap', {
        body: { action: mode, email, bootstrapSecret: secret },
      })
      if (invokeError) throw invokeError
      setSecret('')
      setMessage('Convite enviado. Abra o e-mail neste dispositivo para concluir a conta e definir sua senha.')
    } catch {
      setError(mode === 'start' ? 'Não foi possível iniciar o aplicativo.' : 'Não foi possível reenviar o convite inicial.')
    } finally { setSubmitting(false) }
  }

  return (
    <main className="auth-page"><section className="auth-panel" aria-labelledby="setup-title">
      <p className="route-kicker">Acesso do operador</p><h1 id="setup-title">Configuração inicial</h1>
      <p className="auth-copy">Esta tela não é cadastro público. Ela exige o segredo de bootstrap que existe apenas no servidor/operador.</p>
      <div className="segmented" role="group" aria-label="Tipo de configuração">
        <button type="button" data-active={mode === 'start' || undefined} onClick={() => setMode('start')}>Primeiro convite</button>
        <button type="button" data-active={mode === 'reinvite' || undefined} onClick={() => setMode('reinvite')}>Reenviar expirado</button>
      </div>
      <form className="auth-form" onSubmit={submit}>
        <label>E-mail da primeira pessoa<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Segredo de bootstrap<input type="password" autoComplete="off" required value={secret} onChange={(e) => setSecret(e.target.value)} /></label>
        {error ? <p className="auth-error" role="alert">{error}</p> : null}{message ? <p role="status">{message}</p> : null}
        <button className="button button--primary" disabled={submitting}>{submitting ? 'Enviando…' : mode === 'start' ? 'Enviar primeiro convite' : 'Reenviar convite'}</button>
      </form><Link to="/login">Voltar</Link>
    </section></main>
  )
}
