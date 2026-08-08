import { useState, type FormEvent } from 'react'
import { formatAmount, parseAmount } from '../domain/amount'
import type { IngredientAmount, Rational } from '../domain/types'
import type { RecipeAggregate, RecipeDraft } from '../data/recipe-repository'
import type { RecipeCategory } from '../data/category-repository'
import { CategorySelector } from './CategorySelector'
import { IngredientEditor, type IngredientEditorValue } from './IngredientEditor'
import { StepEditor, type StepEditorValue } from './StepEditor'

interface RecipeEditorProps {
  initial?: RecipeAggregate | null
  availableCategories?: readonly RecipeCategory[]
  initialCategoryIds?: readonly string[]
  onSave(draft: RecipeDraft, categoryIds: string[]): void | Promise<void>
  onCancel?: () => void
}

function newId(): string {
  return crypto.randomUUID()
}

function cleanOptional(value: string): string | null {
  const trimmed = value.trim()
  return trimmed || null
}

function minutesToSeconds(value: string, label: string): number | null {
  if (!value.trim()) return null
  const minutes = Number(value.replace(',', '.'))
  const seconds = minutes * 60
  if (!Number.isFinite(minutes) || minutes < 0 || !Number.isSafeInteger(seconds)) {
    throw new Error(`${label} precisa ser um número válido de minutos.`)
  }
  return seconds
}

function secondsToMinutes(value: number | null): string {
  if (value === null) return ''
  return String(value / 60).replace('.', ',')
}

function parseBaseYield(value: string): Rational | null {
  if (!value.trim()) return null
  const parsed = parseAmount(value)
  if (parsed.kind !== 'numeric' || parsed.value.numerator <= 0) {
    throw new Error('O rendimento precisa ser uma quantidade numérica maior que zero.')
  }
  return parsed.value
}

function initialIngredients(recipe?: RecipeAggregate | null): IngredientEditorValue[] {
  return recipe?.ingredients.map((ingredient) => ({
    id: ingredient.id,
    amountText: formatAmount(ingredient.amount),
    unit: ingredient.unit ?? '',
    name: ingredient.name,
    note: ingredient.note ?? '',
    isApproximate: ingredient.isApproximate,
    isOptional: ingredient.isOptional,
  })) ?? []
}

function initialSteps(recipe?: RecipeAggregate | null): StepEditorValue[] {
  return recipe?.steps.map((step) => ({
    id: step.id,
    instruction: step.instruction,
    durationMinutes: secondsToMinutes(step.durationSeconds),
    note: step.note ?? '',
  })) ?? []
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return items
  const next = [...items]
  const [item] = next.splice(from, 1)
  if (item === undefined) return items
  next.splice(to, 0, item)
  return next
}

export function RecipeEditor({
  initial,
  availableCategories = [],
  initialCategoryIds = [],
  onSave,
  onCancel,
}: RecipeEditorProps) {
  const [recipeId] = useState(() => initial?.id ?? newId())
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [baseYield, setBaseYield] = useState(() => initial?.baseYield ? formatAmount({ kind: 'numeric', value: initial.baseYield }) : '')
  const [baseYieldUnit, setBaseYieldUnit] = useState(initial?.baseYieldUnit ?? '')
  const [prepMinutes, setPrepMinutes] = useState(() => secondsToMinutes(initial?.prepTimeSeconds ?? null))
  const [cookMinutes, setCookMinutes] = useState(() => secondsToMinutes(initial?.cookTimeSeconds ?? null))
  const [favorite, setFavorite] = useState(initial?.favorite ?? false)
  const [wantToMake, setWantToMake] = useState(initial?.wantToMake ?? false)
  const [categoryIds, setCategoryIds] = useState<string[]>(() => [...initialCategoryIds])
  const [ingredients, setIngredients] = useState<IngredientEditorValue[]>(() => initialIngredients(initial))
  const [steps, setSteps] = useState<StepEditorValue[]>(() => initialSteps(initial))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addIngredient = () => setIngredients((current) => [...current, {
    id: newId(), amountText: '', unit: '', name: '', note: '', isApproximate: false, isOptional: false,
  }])
  const addStep = () => setSteps((current) => [...current, {
    id: newId(), instruction: '', durationMinutes: '', note: '',
  }])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    try {
      if (!title.trim()) throw new Error('Informe um título para a receita.')

      const parsedIngredients = ingredients.map((ingredient, index) => {
        if (!ingredient.name.trim()) throw new Error(`Informe o nome do ingrediente ${index + 1}.`)
        let amount: IngredientAmount
        try {
          amount = parseAmount(ingredient.amountText)
        } catch {
          throw new Error(`A quantidade do ingrediente ${index + 1} é inválida.`)
        }
        return {
          id: ingredient.id,
          amount,
          unit: cleanOptional(ingredient.unit),
          name: ingredient.name.trim(),
          note: cleanOptional(ingredient.note),
          isApproximate: ingredient.isApproximate,
          isOptional: ingredient.isOptional,
        }
      })

      const parsedSteps = steps.map((step, index) => {
        if (!step.instruction.trim()) throw new Error(`Informe a instrução da etapa ${index + 1}.`)
        return {
          id: step.id,
          instruction: step.instruction.trim(),
          durationSeconds: minutesToSeconds(step.durationMinutes, `A duração da etapa ${index + 1}`),
          note: cleanOptional(step.note),
        }
      })

      const draft: RecipeDraft = {
        id: recipeId,
        title: title.trim(),
        description: cleanOptional(description),
        baseYield: parseBaseYield(baseYield),
        baseYieldUnit: cleanOptional(baseYieldUnit),
        prepTimeSeconds: minutesToSeconds(prepMinutes, 'O tempo de preparo'),
        cookTimeSeconds: minutesToSeconds(cookMinutes, 'O tempo de cozimento'),
        favorite,
        wantToMake,
        ingredients: parsedIngredients,
        steps: parsedSteps,
      }

      setSaving(true)
      await onSave(draft, categoryIds)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a receita.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="recipe-editor" onSubmit={(event) => void submit(event)}>
      <div className="recipe-editor__section">
        <label>
          <span>Título</span>
          <input aria-label="Título" value={title} onChange={(event) => setTitle(event.currentTarget.value)} required maxLength={200} autoFocus />
        </label>
        <label>
          <span>Descrição / notas</span>
          <textarea rows={3} value={description} onChange={(event) => setDescription(event.currentTarget.value)} />
        </label>
        <div className="recipe-editor__grid">
          <label>
            <span>Rendimento</span>
            <input inputMode="decimal" value={baseYield} placeholder="4" onChange={(event) => setBaseYield(event.currentTarget.value)} />
          </label>
          <label>
            <span>Unidade do rendimento</span>
            <input value={baseYieldUnit} placeholder="porções" onChange={(event) => setBaseYieldUnit(event.currentTarget.value)} />
          </label>
          <label>
            <span>Preparo (min)</span>
            <input type="number" min="0" step="1" inputMode="numeric" value={prepMinutes} onChange={(event) => setPrepMinutes(event.currentTarget.value)} />
          </label>
          <label>
            <span>Cozimento (min)</span>
            <input type="number" min="0" step="1" inputMode="numeric" value={cookMinutes} onChange={(event) => setCookMinutes(event.currentTarget.value)} />
          </label>
        </div>
        <div className="recipe-editor__flags">
          <label><input type="checkbox" checked={favorite} onChange={(event) => setFavorite(event.currentTarget.checked)} /> Favorita</label>
          <label><input type="checkbox" checked={wantToMake} onChange={(event) => setWantToMake(event.currentTarget.checked)} /> Queremos fazer</label>
        </div>
        <CategorySelector categories={availableCategories} selectedIds={categoryIds} onChange={setCategoryIds} />
      </div>

      <section className="recipe-editor__section" aria-labelledby="ingredients-editor-title">
        <div className="recipe-editor__section-heading">
          <div><p className="route-kicker">Estrutura</p><h2 id="ingredients-editor-title">Ingredientes</h2></div>
          <button type="button" className="button button--quiet" onClick={addIngredient}>Adicionar ingrediente</button>
        </div>
        {ingredients.length === 0 ? <p className="recipe-editor__empty">Adicione os ingredientes quando quiser. A receita também pode ser salva sem eles.</p> : null}
        {ingredients.map((ingredient, index) => (
          <IngredientEditor
            key={ingredient.id}
            value={ingredient}
            index={index}
            total={ingredients.length}
            onChange={(value) => setIngredients((current) => current.map((item) => item.id === value.id ? value : item))}
            onMoveUp={() => setIngredients((current) => moveItem(current, index, index - 1))}
            onMoveDown={() => setIngredients((current) => moveItem(current, index, index + 1))}
            onRemove={() => setIngredients((current) => current.filter((item) => item.id !== ingredient.id))}
          />
        ))}
      </section>

      <section className="recipe-editor__section" aria-labelledby="steps-editor-title">
        <div className="recipe-editor__section-heading">
          <div><p className="route-kicker">Preparo</p><h2 id="steps-editor-title">Etapas</h2></div>
          <button type="button" className="button button--quiet" onClick={addStep}>Adicionar etapa</button>
        </div>
        {steps.length === 0 ? <p className="recipe-editor__empty">Adicione as etapas de preparo quando necessário.</p> : null}
        {steps.map((step, index) => (
          <StepEditor
            key={step.id}
            value={step}
            index={index}
            total={steps.length}
            onChange={(value) => setSteps((current) => current.map((item) => item.id === value.id ? value : item))}
            onMoveUp={() => setSteps((current) => moveItem(current, index, index - 1))}
            onMoveDown={() => setSteps((current) => moveItem(current, index, index + 1))}
            onRemove={() => setSteps((current) => current.filter((item) => item.id !== step.id))}
          />
        ))}
      </section>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      <div className="recipe-editor__footer">
        {onCancel ? <button type="button" className="button button--quiet" disabled={saving} onClick={onCancel}>Cancelar</button> : null}
        <button type="submit" className="button button--primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar receita'}</button>
      </div>
    </form>
  )
}
