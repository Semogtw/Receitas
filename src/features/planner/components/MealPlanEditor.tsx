import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { parseAmount } from '../../recipes/domain/amount'
import type { RecipeSummary } from '../../recipes/data/recipe-repository'
import type { MealPeriod, MealPlanEntry, MealPlanEntryInput } from '../domain/types'

interface MealPlanEditorProps {
  date: string
  recipes: readonly RecipeSummary[]
  periods: readonly MealPeriod[]
  initial?: MealPlanEntry | null
  onSave: (entry: MealPlanEntryInput & { id?: string }) => Promise<void> | void
  onCancel: () => void
}

function servingsText(entry: MealPlanEntry | null | undefined): string {
  if (!entry?.servings) return ''
  const { numerator, denominator } = entry.servings
  return denominator === 1 ? String(numerator) : `${numerator}/${denominator}`
}

export function MealPlanEditor({ date, recipes, periods, initial, onSave, onCancel }: MealPlanEditorProps) {
  const defaultRecipeId = initial?.recipeId ?? recipes[0]?.id ?? ''
  const defaultPeriodId = initial?.mealPeriodId ?? periods[0]?.id ?? ''
  const [recipeId, setRecipeId] = useState(defaultRecipeId)
  const [mealPeriodId, setMealPeriodId] = useState(defaultPeriodId)
  const [time, setTime] = useState(initial?.time ?? '')
  const [servings, setServings] = useState(servingsText(initial))
  const [note, setNote] = useState(initial?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setRecipeId(initial?.recipeId ?? recipes[0]?.id ?? '')
    setMealPeriodId(initial?.mealPeriodId ?? periods[0]?.id ?? '')
    setTime(initial?.time ?? '')
    setServings(servingsText(initial))
    setNote(initial?.note ?? '')
    setError(null)
  }, [initial, periods, recipes])

  const recipeTitle = useMemo(
    () => recipes.find((recipe) => recipe.id === recipeId)?.title ?? 'Refeição',
    [recipeId, recipes],
  )

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!recipeId || !mealPeriodId) {
      setError('Escolha uma receita e um período.')
      return
    }

    let parsedServings: MealPlanEntryInput['servings'] = null
    if (servings.trim()) {
      const amount = parseAmount(servings)
      if (amount.kind !== 'numeric' || amount.value.numerator <= 0) {
        setError('Use uma quantidade numérica de porções, como 2, 2,5 ou 3/2.')
        return
      }
      parsedServings = amount.value
    }

    setSaving(true)
    try {
      await onSave({
        ...(initial ? { id: initial.id } : {}),
        recipeId,
        date,
        mealPeriodId,
        time: time || null,
        servings: parsedServings,
        note: note.trim() || null,
      })
    } catch {
      setError('Não foi possível salvar este planejamento agora.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="planner-editor" role="dialog" aria-modal="true" aria-labelledby="planner-editor-title">
      <form className="planner-editor__panel" onSubmit={handleSubmit}>
        <header>
          <h2 id="planner-editor-title">{initial ? `Editar ${recipeTitle}` : 'Planejar refeição'}</h2>
          <p>O planejamento fica disponível neste dispositivo mesmo sem internet.</p>
        </header>

        <label className="field-stack">
          <span>Receita</span>
          <select value={recipeId} onChange={(event) => setRecipeId(event.target.value)} required>
            <option value="" disabled>Escolha uma receita</option>
            {recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.title}</option>)}
          </select>
        </label>

        <div className="planner-editor__grid">
          <label className="field-stack">
            <span>Período</span>
            <select value={mealPeriodId} onChange={(event) => setMealPeriodId(event.target.value)} required>
              <option value="" disabled>Escolha um período</option>
              {periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
            </select>
          </label>

          <label className="field-stack">
            <span>Horário opcional</span>
            <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          </label>
        </div>

        <label className="field-stack">
          <span>Porções opcionais</span>
          <input
            inputMode="decimal"
            value={servings}
            onChange={(event) => setServings(event.target.value)}
            placeholder="Ex.: 2,5"
          />
        </label>

        <label className="field-stack">
          <span>Observação</span>
          <textarea
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Algo para lembrar no preparo"
          />
        </label>

        {error ? <p className="auth-error" role="alert">{error}</p> : null}

        <div className="planner-editor__actions">
          <button type="button" className="button button--quiet" onClick={onCancel} disabled={saving}>Cancelar</button>
          <button type="submit" className="button button--primary" disabled={saving || recipes.length === 0 || periods.length === 0}>
            {saving ? 'Salvando…' : 'Salvar planejamento'}
          </button>
        </div>
      </form>
    </div>
  )
}
