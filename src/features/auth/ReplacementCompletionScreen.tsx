import { FormEvent, useEffect, useMemo, useState } from 'react'
import { getSupabaseClient } from '../../lib/supabase/client'

interface ReplacementAuthClient {
  auth: {
    getSession(): Promise<{
      data: { session: { user: { id: string; email?: string | null } } | null }
      error: unknown | null
    }>
    updateUser(input: { password: string }): Promise<{
      data: { user: { id: string } | null }
      error: unknown | null
    }>
  }
  functions: {
    invoke<T>(name: string, options: { body: Record<string, unknown> }): Promise<{ data: T | null; error: unknown | null }>
  }
}

interface ReplacementCompletionScreenProps {
  client?: ReplacementAuthClient
  onCompleted?: () => void
}

function normalizedPassword(value: string): string {
  if (value.length < 12) throw new Error('A nova senha precisa ter pelo menos 12 caracteres.')
  if (value.length > 256) throw new Error('A nova senha é longa demais.')
  return value
}

export function ReplacementCompletionScreen({
  client: injectedClient,
  onCompleted,
}: ReplacementCompletionScreenProps) {
  const client = useMemo(
    () => injectedClient ?? getSupabaseClient() as unknown as ReplacementAuthClient,
    [injectedClient],
  )
  const [email, setEmail] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [completed, setCompleted] = useState(false)

  useEffect(() => {
    let active = true
    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return
      const session = data.session
      if (sessionError || !session?.user) {
        setError('Este convite de recuperação não está mais autenticado. Abra novamente o link recebido por e-mail.')
        setReady(false)
        return
      }
      setEmail(session.user.email?.trim().toLocaleLowerCase('en-US') ?? null)
      setReady(true)
    }).catch(() => {
      if (active) setError('Não foi possível validar a sessão deste convite de recuperação.')
    })
    return () => { active = false }
  }, [client])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!ready || completed) return
    setSubmitting(true)
    setError(null)
    try {
      const nextPassword = normalizedPassword(password)
      if (nextPassword !== confirmation) throw new Error('As duas senhas precisam ser iguais.')

      const { data: updateData, error: updateError } = await client.auth.updateUser({ password: nextPassword })
      if (updateError || !updateData.user) throw new Error('Não foi possível definir a senha da nova identidade.')

      const { data, error: completionError } = await client.functions.invoke<Record<string, unknown>>('account-admin', {
        body: { action: 'complete_replacement' },
      })
      if (completionError || !data || typeof data.pairId !== 'string') {
        throw new Error('A senha foi definida, mas a vaga administrativa ainda não pôde ser ativada. Tente concluir novamente com este mesmo link/sessão.')
      }

      setPassword('')
      setConfirmation('')
      setCompleted(true)
      if (onCompleted) onCompleted()
      else window.location.assign('/recipes')
    } catch (cause) {
      setPassword('')
      setConfirmation('')
      setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a recuperação desta identidade.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="replacement-completion-title">
        <p className="auth-kicker">Recuperação privada</p>
        <h1 id="replacement-completion-title">Concluir substituição de identidade</h1>
        <p>
          Este fluxo existe somente para uma vaga de recuperação administrativa já reservada em um par fechado. Ele não cria um novo par nem reabre cadastro público.
        </p>

        {email ? <p className="auth-muted">Identidade convidada: <strong>{email}</strong></p> : null}

        {completed ? (
          <p role="status">Identidade ativada. Abrindo o caderno compartilhado…</p>
        ) : (
          <form className="auth-form" onSubmit={(event) => void submit(event)}>
            <label>
              Nova senha
              <input
                type="password"
                minLength={12}
                maxLength={256}
                autoComplete="new-password"
                value={password}
                disabled={!ready || submitting}
                onChange={(event) => setPassword(event.currentTarget.value)}
              />
            </label>
            <label>
              Repetir nova senha
              <input
                type="password"
                minLength={12}
                maxLength={256}
                autoComplete="new-password"
                value={confirmation}
                disabled={!ready || submitting}
                onChange={(event) => setConfirmation(event.currentTarget.value)}
              />
            </label>
            <button
              type="submit"
              className="button button--primary"
              disabled={!ready || submitting || !password || !confirmation}
            >
              {submitting ? 'Concluindo…' : 'Ativar identidade substituta'}
            </button>
          </form>
        )}

        {error ? <p className="auth-error" role="alert">{error}</p> : null}
      </section>
    </main>
  )
}
