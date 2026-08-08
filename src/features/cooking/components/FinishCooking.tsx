import { useState, type FormEvent } from 'react'
import { formatAmount, parseAmount } from '../../recipes/domain/amount'
import type { Rational } from '../../recipes/domain/types'

export interface FinishCookingValue {
  preparedYield: Rational | null
  sharedObservation: string | null
}

interface FinishCookingProps {
  baseYield?: Rational | null
  baseYieldUnit?: string | null
  onFinish(value: FinishCookingValue): void | Promise<void>
  onCancel?: () => void
}

function cleanOptional(value: string): string | null {
  const trimmed = value.trim()
  return trimmed || null
}

export function FinishCooking({ baseYield = null, baseYieldUnit = null, onFinish, onCancel }: FinishCookingProps) {
  const [yieldText, setYieldText] = useState(() => baseYield ? formatAmount({ kind: 'numeric', value: baseYield }) : '')
  const [observation, setObservation] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError(null)

    try {
      let preparedYield: Rational | null = null
      if (yieldText.trim()) {
        const parsed = parseAmount(yieldText)
        if (parsed.kind !== 'numeric' || parsed.value.numerator <= 0) {
          throw new Error('O rendimento preparado precisa ser uma quantidade numérica maior que zero.')
        }
        preparedYield = parsed.value
      }

      setSaving(true)
      await onFinish({
        preparedYield,
        sharedObservation: cleanOptional(observation),
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível finalizar o preparo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="finish-cooking" onSubmit={(event) => void submit(event)}>
      <div>
        <p className="route-kicker">Registrar preparo</p>
        <h2>Como ficou desta vez?</h2>
        <p className="finish-cooking__intro">O registro guarda uma cópia da receita como ela estava neste preparo.</p>
      </div>

      <label>
        <span>Rendimento preparado{baseYieldUnit ? ` (${baseYieldUnit})` : ''}</span>
        <input
          aria-label="Rendimento preparado"
          inputMode="decimal"
          value={yieldText}
          placeholder="Ex.: 4 ou 6 1/2"
          onChange={(event) => setYieldText(event.currentTarget.value)}
        />
      </label>

      <label>
        <span>Observação compartilhada</span>
        <textarea
          aria-label="Observação compartilhada"
          rows={4}
          value={observation}
          placeholder="Algo que vale lembrar para a próxima vez"
          onChange={(event) => setObservation(event.currentTarget.value)}
        />
      </label>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      <div className="finish-cooking__actions">
        {onCancel ? <button type="button" className="button button--quiet" disabled={saving} onClick={onCancel}>Voltar</button> : null}
        <button type="submit" className="button button--primary" disabled={saving}>{saving ? 'Finalizando…' : 'Finalizar preparo'}</button>
      </div>
    </form>
  )
}
