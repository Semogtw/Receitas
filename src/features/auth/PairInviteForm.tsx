import { useEffect, useState, type FormEvent } from 'react'
import { getSupabaseClient } from '../../lib/supabase/client'
import { useAuth } from './AuthProvider'

type PairState = 'loading' | 'open' | 'closed' | 'unavailable'

export function PairInviteForm() {
  const auth = useAuth()
  const [pairState, setPairState] = useState<PairState>('loading')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadPairState() {
      if (!auth.pairId || auth.restoredFromLocalScope) {
        if (!cancelled) setPairState('unavailable')
        return
      }
      const { data, error: queryError } = await getSupabaseClient()
        .from('pairs')
        .select('status')
        .eq('id', auth.pairId)
        .single()
      if (cancelled) return
      if (queryError) setPairState('unavailable')
      else setPairState(data?.status === 'open_for_second_member' ? 'open' : 'closed')
    }
    void loadPairState()
    return () => { cancelled = true }
  }, [auth.pairId, auth.restoredFromLocalScope])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pairState !== 'open') return
    setSubmitting(true); setError(null); setMessage(null)
    try {
      const { error: invokeError } = await getSupabaseClient().functions.invoke('pair-invite', { body: { email } })
      if (invokeError) throw invokeError
      setEmail('')
      setMessage('Convite enviado. Se havia um convite anterior pendente, somente o mais recente continua válido.')
    } catch {
      setError('Não foi possível enviar o convite agora. Verifique a conexão e tente novamente.')
    } finally { setSubmitting(false) }
  }

  if (pairState === 'loading') return <section className="settings-section"><p role="status">Verificando o par…</p></section>
  if (pairState === 'closed') return <section className="settings-section"><h2>Par</h2><p>Par completo: as duas identidades autorizadas já estão vinculadas.</p></section>
  if (pairState === 'unavailable') return <section className="settings-section"><h2>Par</h2><p>O estado do par exige conexão para ser verificado. Convites não podem ser emitidos offline.</p></section>

  return <section className="settings-section" aria-labelledby="invite-title">
    <h2 id="invite-title">Convidar a segunda pessoa</h2>
    <p>Um novo envio substitui qualquer convite ainda pendente. Depois que a segunda pessoa concluir o vínculo, esta opção desaparece.</p>
    <form className="auth-form settings-form" onSubmit={submit}>
      <label>E-mail da segunda pessoa<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}{message ? <p role="status">{message}</p> : null}
      <button className="button button--primary" disabled={submitting}>{submitting ? 'Enviando…' : 'Enviar convite'}</button>
    </form>
  </section>
}
