import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { getSupabaseClient } from '../../lib/supabase/client'
import { useAuth } from './AuthProvider'

export function UpdatePasswordScreen() {
  const auth = useAuth(); const navigate = useNavigate()
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null); const [submitting, setSubmitting] = useState(false)
  if (auth.status === 'loading') return <main className="auth-page"><p role="status">Validando link…</p></main>
  if (auth.status === 'signed_out') return <Navigate to="/login" replace />

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null)
    if (password.length < 12) { setError('A senha precisa ter pelo menos 12 caracteres.'); return }
    if (password !== confirm) { setError('As senhas não coincidem.'); return }
    setSubmitting(true)
    const { error: updateError } = await getSupabaseClient().auth.updateUser({ password })
    if (updateError) setError('Não foi possível alterar a senha.')
    else navigate('/recipes', { replace: true })
    setSubmitting(false)
  }

  return <main className="auth-page"><section className="auth-panel" aria-labelledby="password-title">
    <h1 id="password-title">Escolher nova senha</h1>
    <form className="auth-form" onSubmit={submit}>
      <label>Nova senha<input type="password" minLength={12} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <label>Repetir senha<input type="password" minLength={12} autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}<button className="button button--primary" disabled={submitting}>Salvar nova senha</button>
    </form>
  </section></main>
}
