import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { completeInvitation, type InviteKind } from './invite-completion'
import { useAuth } from './AuthProvider'

export function FinishInviteScreen() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const kind: InviteKind = params.get('kind') === 'pair' ? 'pair' : 'bootstrap'
  const pairToken = params.get('pair_invite')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (auth.status === 'loading') return <main className="auth-page"><p role="status">Confirmando convite…</p></main>
  if (auth.status === 'signed_out') return <Navigate to="/auth/pending" replace />
  if (auth.status === 'ready') return <Navigate to="/recipes" replace />

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null)
    if (password !== confirm) { setError('As senhas não coincidem.'); return }
    setSubmitting(true)
    try {
      await completeInvitation({ kind, password, pairInviteToken: pairToken })
      await auth.refreshAuth()
      navigate('/recipes', { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível concluir o convite.')
    } finally { setSubmitting(false) }
  }

  return (
    <main className="auth-page"><section className="auth-panel" aria-labelledby="finish-title">
      <h1 id="finish-title">Concluir sua conta</h1>
      <p className="auth-copy">Escolha uma senha com pelo menos 12 caracteres. O vínculo com o caderno só será ativado depois desta etapa.</p>
      <form className="auth-form" onSubmit={submit}>
        <label>Nova senha<input type="password" minLength={12} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <label>Repetir senha<input type="password" minLength={12} autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <button className="button button--primary" disabled={submitting}>{submitting ? 'Concluindo…' : 'Concluir acesso'}</button>
      </form>
    </section></main>
  )
}
