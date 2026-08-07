import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from './AuthProvider'

export function LoginScreen() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await auth.signIn(email, password)
      await auth.refreshAuth()
      navigate('/recipes', { replace: true })
    } catch {
      setError('Não foi possível entrar com essas credenciais.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="login-title">
        <p className="route-kicker">Nosso caderno</p>
        <h1 id="login-title">Entrar</h1>
        <p className="auth-copy">Use uma das duas contas já autorizadas para acessar as receitas.</p>
        <form className="auth-form" onSubmit={submit}>
          <label>E-mail<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>Senha<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          <button className="button button--primary" type="submit" disabled={submitting}>{submitting ? 'Entrando…' : 'Entrar'}</button>
        </form>
        <div className="auth-links"><Link to="/recover">Esqueci minha senha</Link><Link to="/setup">Configuração inicial</Link></div>
      </section>
    </main>
  )
}
