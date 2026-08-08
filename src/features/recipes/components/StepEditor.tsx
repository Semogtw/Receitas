export interface StepEditorValue {
  id: string
  instruction: string
  durationMinutes: string
  note: string
}

interface StepEditorProps {
  value: StepEditorValue
  index: number
  total: number
  onChange(value: StepEditorValue): void
  onMoveUp(): void
  onMoveDown(): void
  onRemove(): void
}

export function StepEditor({ value, index, total, onChange, onMoveUp, onMoveDown, onRemove }: StepEditorProps) {
  const number = index + 1
  const update = <K extends keyof StepEditorValue>(key: K, next: StepEditorValue[K]) => {
    onChange({ ...value, [key]: next })
  }

  return (
    <fieldset className="recipe-editor-row recipe-step-row" data-testid="step-row" data-id={value.id}>
      <legend>Etapa {number}</legend>
      <label>
        <span>Instrução</span>
        <textarea
          aria-label={`Instrução da etapa ${number}`}
          rows={3}
          value={value.instruction}
          required
          placeholder="Descreva o que fazer nesta etapa"
          onChange={(event) => update('instruction', event.currentTarget.value)}
        />
      </label>
      <div className="recipe-step-row__meta">
        <label>
          <span>Duração (min)</span>
          <input
            aria-label={`Duração em minutos da etapa ${number}`}
            type="number"
            min="0"
            step="0.5"
            inputMode="decimal"
            value={value.durationMinutes}
            onChange={(event) => update('durationMinutes', event.currentTarget.value)}
          />
        </label>
        <label>
          <span>Observação</span>
          <input
            aria-label={`Observação da etapa ${number}`}
            value={value.note}
            placeholder="Opcional"
            onChange={(event) => update('note', event.currentTarget.value)}
          />
        </label>
      </div>
      <div className="recipe-editor-row__actions" aria-label={`Ações da etapa ${number}`}>
        <button type="button" className="button button--quiet" disabled={index === 0} onClick={onMoveUp} aria-label={`Mover etapa ${number} para cima`}>↑</button>
        <button type="button" className="button button--quiet" disabled={index === total - 1} onClick={onMoveDown} aria-label={`Mover etapa ${number} para baixo`}>↓</button>
        <button type="button" className="button button--quiet" onClick={onRemove} aria-label={`Remover etapa ${number}`}>Remover</button>
      </div>
    </fieldset>
  )
}
