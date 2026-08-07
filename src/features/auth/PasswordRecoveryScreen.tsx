import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useAuth } from './AuthProvider'

export function PasswordRecoveryScreen() {
  const auth = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    try {
      await auth.requestPasswordReset(email)
    } finally {
      setSent(true)
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page"><section className="auth-panel" aria-labelledby="recover-title">
      <h1 id="recover-title">Redefinir senha</h1>
      <p className="auth-copy">Se o endereço pertencer a uma conta autorizada, enviaremos um link para escolher uma nova senha.</p>
      {sent ? <p role="status">Verifique seu e-mail. Por segurança, esta mensagem é a mesma mesmo quando o endereço não possui conta.</p> : (
        <form className="auth-form" onSubmit={submit}>
          <label>E-mail<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <button className="button button--primary" disabled={submitting}>{submitting ? 'Enviando…' : 'Enviar link'}</button>
        </form>
      )}
      <Link to="/login">Voltar para entrar</Link>
    </section></main>
  )
}
