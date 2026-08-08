import { useState, type FormEvent } from 'react'
import { assertValidCookingScore } from '../domain/cooking-session'

export interface RatingFormValue {
  score: number
  comment: string | null
}

interface RatingFormProps {
  initial?: RatingFormValue | null
  onSave(value: RatingFormValue): void | Promise<void>
}

const scoreOptions = Array.from({ length: 21 }, (_, index) => index / 2)

function cleanOptional(value: string): string | null {
  const trimmed = value.trim()
  return trimmed || null
}

export function RatingForm({ initial = null, onSave }: RatingFormProps) {
  const [score, setScore] = useState(initial ? String(initial.score) : '')
  const [comment, setComment] = useState(initial?.comment ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError(null)

    try {
      if (!score) throw new Error('Escolha uma nota antes de salvar.')
      const numericScore = Number(score)
      assertValidCookingScore(numericScore)
      setSaving(true)
      await onSave({ score: numericScore, comment: cleanOptional(comment) })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar sua avaliação.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="rating-form" onSubmit={(event) => void submit(event)}>
      <div>
        <p className="route-kicker">Avaliação individual</p>
        <h3>Minha avaliação</h3>
        <p className="rating-form__intro">Esta nota e este comentário são individuais; a outra pessoa pode registrar uma opinião diferente.</p>
      </div>
      <label>
        <span>Minha nota</span>
        <select aria-label="Minha nota" value={score} onChange={(event) => setScore(event.currentTarget.value)}>
          <option value="">Selecione…</option>
          {scoreOptions.map((value) => (
            <option key={value} value={String(value)}>{String(value).replace('.', ',')}/10</option>
          ))}
        </select>
      </label>
      <label>
        <span>Meu comentário</span>
        <textarea
          aria-label="Meu comentário"
          rows={3}
          value={comment}
          placeholder="O que eu achei deste preparo"
          onChange={(event) => setComment(event.currentTarget.value)}
        />
      </label>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      <button type="submit" className="button button--primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar minha avaliação'}</button>
    </form>
  )
}
