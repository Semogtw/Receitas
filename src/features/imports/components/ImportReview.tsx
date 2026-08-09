import { useMemo, useState } from 'react'
import type { ImportPreview, ImportStrategy } from '../data/import-client'
import type { ImportedRecipeDraft } from '../domain/normalize-import'

interface ImportReviewProps {
  preview: ImportPreview
  saving?: boolean
  onConfirm: (draft: ImportedRecipeDraft, strategy: ImportStrategy) => Promise<void> | void
  onBack: () => void
  onCancel: () => void
}

function numberValue(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export function ImportReview({ preview, saving = false, onConfirm, onBack, onCancel }: ImportReviewProps) {
  const [draft, setDraft] = useState<ImportedRecipeDraft>(() => ({
    ...preview.draft,
    ingredients: preview.draft.ingredients.map((ingredient) => ({ ...ingredient })),
    steps: preview.draft.steps.map((step) => ({ ...step })),
    warnings: [...preview.draft.warnings],
  }))
  const [prepMinutes, setPrepMinutes] = useState(draft.prepTimeMinutes === null ? '' : String(draft.prepTimeMinutes))
  const [cookMinutes, setCookMinutes] = useState(draft.cookTimeMinutes === null ? '' : String(draft.cookTimeMinutes))
  const canSave = useMemo(() => Boolean(draft.title?.trim()) && !saving, [draft.title, saving])

  function updateIngredient(index: number, raw: string) {
    setDraft((current) => ({
      ...current,
      ingredients: current.ingredients.map((ingredient, itemIndex) => (
        itemIndex === index ? { raw } : ingredient
      )),
    }))
  }

  function removeIngredient(index: number) {
    setDraft((current) => ({
      ...current,
      ingredients: current.ingredients.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  function updateStep(index: number, instruction: string) {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step, itemIndex) => itemIndex === index ? { instruction } : step),
    }))
  }

  function removeStep(index: number) {
    setDraft((current) => ({
      ...current,
      steps: current.steps.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  async function confirm() {
    if (!canSave) return
    await onConfirm({
      ...draft,
      title: draft.title?.trim() || null,
      description: draft.description?.trim() || null,
      servings: draft.servings?.trim() || null,
      sourceUrl: draft.sourceUrl?.trim() || null,
      imageUrl: draft.imageUrl?.trim() || null,
      prepTimeMinutes: numberValue(prepMinutes),
      cookTimeMinutes: numberValue(cookMinutes),
      ingredients: draft.ingredients.filter((ingredient) => ingredient.raw.trim()),
      steps: draft.steps.filter((step) => step.instruction.trim()),
    }, preview.strategy)
  }

  return (
    <section className="import-review" aria-labelledby="import-review-title">
      <header className="import-review__header">
        <div>
          <p className="route-kicker">Revisão obrigatória</p>
          <h1 id="import-review-title">Revise antes de salvar</h1>
          <p className="route-intro">Nada abaixo entra no caderno até você confirmar. Campos incompletos podem ser corrigidos ou removidos.</p>
        </div>
        <span className="import-strategy" aria-label="Estratégia usada">
          {preview.strategy === 'schema_org' ? 'Dados estruturados' : preview.strategy === 'text_fallback' ? 'Texto da página' : 'Texto colado'}
        </span>
      </header>

      {draft.warnings.length > 0 ? (
        <aside className="import-warnings" aria-label="Avisos da importação">
          <strong>Confira estes pontos</strong>
          <ul>{draft.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </aside>
      ) : null}

      <div className="import-review__fields">
        <label className="field-stack">
          Título
          <input value={draft.title ?? ''} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
        </label>

        <label className="field-stack">
          Descrição
          <textarea rows={4} value={draft.description ?? ''} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} />
        </label>

        <div className="import-review__grid">
          <label className="field-stack">
            Rendimento
            <input placeholder="Ex.: 4 porções" value={draft.servings ?? ''} onChange={(event) => setDraft((current) => ({ ...current, servings: event.target.value }))} />
          </label>
          <label className="field-stack">
            Preparo (min)
            <input type="number" min="0" step="1" inputMode="numeric" value={prepMinutes} onChange={(event) => setPrepMinutes(event.target.value)} />
          </label>
          <label className="field-stack">
            Cozimento (min)
            <input type="number" min="0" step="1" inputMode="numeric" value={cookMinutes} onChange={(event) => setCookMinutes(event.target.value)} />
          </label>
        </div>

        {draft.sourceUrl !== null ? (
          <label className="field-stack">
            Link de origem
            <input type="url" value={draft.sourceUrl} onChange={(event) => setDraft((current) => ({ ...current, sourceUrl: event.target.value }))} />
          </label>
        ) : null}

        {draft.imageUrl !== null ? (
          <label className="field-stack">
            Imagem encontrada
            <input type="url" value={draft.imageUrl} onChange={(event) => setDraft((current) => ({ ...current, imageUrl: event.target.value }))} />
            <small>A URL fica visível nesta revisão, mas a foto remota não é anexada automaticamente nesta etapa. Depois de salvar, adicione a foto pelo fluxo privado de mídia.</small>
          </label>
        ) : null}
      </div>

      <section className="import-review__section" aria-labelledby="import-ingredients-title">
        <div className="import-review__section-header">
          <h2 id="import-ingredients-title">Ingredientes</h2>
          <button type="button" className="button button--quiet" onClick={() => setDraft((current) => ({ ...current, ingredients: [...current.ingredients, { raw: '' }] }))}>Adicionar</button>
        </div>
        <div className="import-review__rows">
          {draft.ingredients.map((ingredient, index) => (
            <div className="import-review__row" key={`ingredient-${index}`}>
              <label className="field-stack">
                <span className="sr-only">Ingrediente {index + 1}</span>
                <input value={ingredient.raw} onChange={(event) => updateIngredient(index, event.target.value)} />
              </label>
              <button type="button" className="button button--quiet" onClick={() => removeIngredient(index)} aria-label={`Remover ingrediente ${index + 1}`}>Remover</button>
            </div>
          ))}
        </div>
      </section>

      <section className="import-review__section" aria-labelledby="import-steps-title">
        <div className="import-review__section-header">
          <h2 id="import-steps-title">Modo de preparo</h2>
          <button type="button" className="button button--quiet" onClick={() => setDraft((current) => ({ ...current, steps: [...current.steps, { instruction: '' }] }))}>Adicionar</button>
        </div>
        <div className="import-review__rows">
          {draft.steps.map((step, index) => (
            <div className="import-review__row import-review__row--step" key={`step-${index}`}>
              <label className="field-stack">
                <span className="sr-only">Etapa {index + 1}</span>
                <textarea rows={3} value={step.instruction} onChange={(event) => updateStep(index, event.target.value)} />
              </label>
              <button type="button" className="button button--quiet" onClick={() => removeStep(index)} aria-label={`Remover etapa ${index + 1}`}>Remover</button>
            </div>
          ))}
        </div>
      </section>

      {!draft.title?.trim() ? <p className="auth-error" role="alert">Informe um título antes de salvar.</p> : null}

      <footer className="import-review__actions">
        <button type="button" className="button button--quiet" onClick={onCancel} disabled={saving}>Cancelar</button>
        <button type="button" className="button button--quiet" onClick={onBack} disabled={saving}>Voltar</button>
        <button type="button" className="button button--primary" onClick={() => void confirm()} disabled={!canSave}>
          {saving ? 'Salvando…' : 'Salvar no caderno'}
        </button>
      </footer>
    </section>
  )
}
