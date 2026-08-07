import { useMemo, useState } from 'react'
import { getSupabaseClient } from '../../lib/supabase/client'
import { buildMergedResolution, conflictFields, type ConflictFieldChoice } from '../../data/conflicts/merge'
import type { ParsedConflict } from '../../data/conflicts/types'

interface ConflictResolverProps {
  conflict: ParsedConflict
  onResolved?: () => void | Promise<void>
  onRefreshed?: () => void | Promise<void>
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    title: 'Título',
    description: 'Descrição',
    favorite: 'Favorito',
    want_to_make: 'Queremos fazer',
    deleted_at: 'Exclusão',
    note: 'Observação',
    comment: 'Comentário',
    shared_observation: 'Observação compartilhada',
    position: 'Ordem',
    instruction: 'Instrução',
    ingredient_name: 'Ingrediente',
    normalized_name: 'Nome normalizado',
    quantity_text: 'Quantidade',
    unit: 'Unidade',
  }
  return labels[field] ?? field.replaceAll('_', ' ')
}

export function ConflictResolver({ conflict, onResolved, onRefreshed }: ConflictResolverProps) {
  const fields = useMemo(() => conflictFields(conflict.base, conflict.local, conflict.remote), [conflict])
  const [choices, setChoices] = useState<Record<string, ConflictFieldChoice>>(
    () => Object.fromEntries(fields.map(({ field }) => [field, 'remote'])) as Record<string, ConflictFieldChoice>,
  )
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const createCollision = conflict.base === null

  async function resolve(strategy: 'choose_local' | 'choose_remote' | 'merge') {
    if (createCollision && strategy !== 'choose_remote') return
    setSubmitting(true)
    setMessage(null)
    setError(null)

    const resolutionPayload = strategy === 'merge'
      ? buildMergedResolution(conflict.remote, conflict.local, choices)
      : null

    const { data, error: rpcError } = await getSupabaseClient().rpc('resolve_conflict', {
      p_conflict_id: conflict.id,
      p_strategy: strategy,
      p_resolution_payload: resolutionPayload,
    })

    if (rpcError) {
      setError('Não foi possível resolver este conflito agora. Nenhuma versão foi descartada.')
      setSubmitting(false)
      return
    }

    const result = Array.isArray(data) ? data[0] : data
    if (result?.result_status === 'refreshed') {
      setMessage('A versão remota mudou enquanto este conflito estava aberto. Atualizamos a comparação; revise novamente antes de decidir.')
      await onRefreshed?.()
      setSubmitting(false)
      return
    }

    if (result?.result_status !== 'resolved') {
      setError('O servidor não confirmou a resolução. Nenhuma versão foi descartada.')
      setSubmitting(false)
      return
    }

    setMessage('Conflito resolvido.')
    await onResolved?.()
    setSubmitting(false)
  }

  return (
    <section className="conflict-resolver" aria-labelledby={`conflict-${conflict.id}`}>
      <p className="route-kicker">Conflito de edição</p>
      <h2 id={`conflict-${conflict.id}`}>{conflict.entity_type}</h2>
      <p>Nenhuma versão será descartada sem uma decisão explícita. A versão remota continua estável enquanto você compara.</p>

      {createCollision ? (
        <p className="conflict-note">Este conflito veio de uma colisão de criação. Por segurança, esta tela só permite manter o registro remoto já existente.</p>
      ) : null}

      <div className="conflict-fields">
        {fields.map(({ field, local, remote, localChanged, remoteChanged }) => (
          <fieldset key={field} className="conflict-field">
            <legend>{fieldLabel(field)}</legend>
            <p className="conflict-meta">Local{localChanged ? ' alterado' : ''} · Remoto{remoteChanged ? ' alterado' : ''}</p>
            <label>
              <input
                type="radio"
                name={`${conflict.id}-${field}`}
                value="local"
                checked={choices[field] === 'local'}
                onChange={() => setChoices((current) => ({ ...current, [field]: 'local' }))}
                disabled={createCollision || submitting}
              />
              <span><strong>Local</strong><br />{displayValue(local)}</span>
            </label>
            <label>
              <input
                type="radio"
                name={`${conflict.id}-${field}`}
                value="remote"
                checked={choices[field] === 'remote'}
                onChange={() => setChoices((current) => ({ ...current, [field]: 'remote' }))}
                disabled={submitting}
              />
              <span><strong>Remoto</strong><br />{displayValue(remote)}</span>
            </label>
          </fieldset>
        ))}
      </div>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}

      <div className="conflict-actions">
        {!createCollision ? <button type="button" className="button button--quiet" disabled={submitting} onClick={() => void resolve('choose_local')}>Usar versão local</button> : null}
        <button type="button" className="button button--quiet" disabled={submitting} onClick={() => void resolve('choose_remote')}>Usar versão remota</button>
        {!createCollision && fields.length > 0 ? <button type="button" className="button button--primary" disabled={submitting} onClick={() => void resolve('merge')}>Mesclar escolhas</button> : null}
      </div>
    </section>
  )
}
