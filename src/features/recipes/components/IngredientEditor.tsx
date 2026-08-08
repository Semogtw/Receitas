export interface IngredientEditorValue {
  id: string
  amountText: string
  unit: string
  name: string
  note: string
  isApproximate: boolean
  isOptional: boolean
}

interface IngredientEditorProps {
  value: IngredientEditorValue
  index: number
  total: number
  onChange(value: IngredientEditorValue): void
  onMoveUp(): void
  onMoveDown(): void
  onRemove(): void
}

export function IngredientEditor({ value, index, total, onChange, onMoveUp, onMoveDown, onRemove }: IngredientEditorProps) {
  const number = index + 1
  const update = <K extends keyof IngredientEditorValue>(key: K, next: IngredientEditorValue[K]) => {
    onChange({ ...value, [key]: next })
  }

  return (
    <fieldset className="recipe-editor-row" data-testid="ingredient-row" data-id={value.id}>
      <legend>Ingrediente {number}</legend>
      <div className="ingredient-fields">
        <label>
          <span>Quantidade</span>
          <input
            aria-label={`Quantidade do ingrediente ${number}`}
            inputMode="decimal"
            value={value.amountText}
            placeholder="1 1/2 ou a gosto"
            onChange={(event) => update('amountText', event.currentTarget.value)}
          />
        </label>
        <label>
          <span>Unidade</span>
          <input
            aria-label={`Unidade do ingrediente ${number}`}
            value={value.unit}
            placeholder="xícara"
            onChange={(event) => update('unit', event.currentTarget.value)}
          />
        </label>
        <label className="ingredient-fields__name">
          <span>Ingrediente</span>
          <input
            aria-label={`Nome do ingrediente ${number}`}
            value={value.name}
            required
            placeholder="Farinha de trigo"
            onChange={(event) => update('name', event.currentTarget.value)}
          />
        </label>
      </div>
      <label>
        <span>Observação</span>
        <input
          aria-label={`Observação do ingrediente ${number}`}
          value={value.note}
          placeholder="Opcional"
          onChange={(event) => update('note', event.currentTarget.value)}
        />
      </label>
      <div className="recipe-editor-row__checks">
        <label><input type="checkbox" checked={value.isApproximate} onChange={(event) => update('isApproximate', event.currentTarget.checked)} /> Quantidade aproximada</label>
        <label><input type="checkbox" checked={value.isOptional} onChange={(event) => update('isOptional', event.currentTarget.checked)} /> Opcional</label>
      </div>
      <div className="recipe-editor-row__actions" aria-label={`Ações do ingrediente ${number}`}>
        <button type="button" className="button button--quiet" disabled={index === 0} onClick={onMoveUp} aria-label={`Mover ingrediente ${number} para cima`}>↑</button>
        <button type="button" className="button button--quiet" disabled={index === total - 1} onClick={onMoveDown} aria-label={`Mover ingrediente ${number} para baixo`}>↓</button>
        <button type="button" className="button button--quiet" onClick={onRemove} aria-label={`Remover ingrediente ${number}`}>Remover</button>
      </div>
    </fieldset>
  )
}
