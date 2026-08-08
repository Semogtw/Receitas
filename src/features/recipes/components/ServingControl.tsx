import { useMemo, useState } from 'react'
import { formatAmount, multiplyRational, parseAmount } from '../domain/amount'
import { servingMultiplier } from '../domain/scaling'
import type { Rational } from '../domain/types'

interface ServingControlProps {
  baseYield: Rational
  baseYieldUnit: string | null
  onMultiplierChange(multiplier: Rational): void
}

const shortcuts: Array<{ label: string; multiplier: Rational }> = [
  { label: '0,5×', multiplier: { numerator: 1, denominator: 2 } },
  { label: '1×', multiplier: { numerator: 1, denominator: 1 } },
  { label: '1,5×', multiplier: { numerator: 3, denominator: 2 } },
  { label: '2×', multiplier: { numerator: 2, denominator: 1 } },
  { label: '3×', multiplier: { numerator: 3, denominator: 1 } },
]

function amountText(value: Rational): string {
  return formatAmount({ kind: 'numeric', value })
}

export function ServingControl({ baseYield, baseYieldUnit, onMultiplierChange }: ServingControlProps) {
  const initial = useMemo(() => amountText(baseYield), [baseYield.denominator, baseYield.numerator])
  const [target, setTarget] = useState(initial)
  const [invalid, setInvalid] = useState(false)

  function applyTarget(raw: string): void {
    setTarget(raw)
    try {
      const parsed = parseAmount(raw)
      if (parsed.kind !== 'numeric' || parsed.value.numerator <= 0) {
        setInvalid(Boolean(raw.trim()))
        return
      }
      setInvalid(false)
      onMultiplierChange(servingMultiplier(parsed.value, baseYield))
    } catch {
      setInvalid(Boolean(raw.trim()))
    }
  }

  function applyShortcut(multiplier: Rational): void {
    const nextTarget = multiplyRational(baseYield, multiplier)
    setTarget(amountText(nextTarget))
    setInvalid(false)
    onMultiplierChange(multiplier)
  }

  return (
    <section className="serving-control" aria-labelledby="serving-control-title">
      <div>
        <p className="route-kicker">Rendimento</p>
        <h2 id="serving-control-title">Ajustar porções</h2>
        <p className="serving-control__base">
          Base: {amountText(baseYield)}{baseYieldUnit ? ` ${baseYieldUnit}` : ''}. O ajuste não altera a receita salva.
        </p>
      </div>
      <div className="serving-control__shortcuts" aria-label="Multiplicadores de porção">
        {shortcuts.map(({ label, multiplier }) => (
          <button key={label} type="button" className="button button--quiet" onClick={() => applyShortcut(multiplier)}>{label}</button>
        ))}
      </div>
      <label className="serving-control__target">
        <span>Porções desejadas</span>
        <input
          aria-label="Porções desejadas"
          inputMode="decimal"
          value={target}
          aria-invalid={invalid || undefined}
          onChange={(event) => applyTarget(event.currentTarget.value)}
        />
      </label>
      {invalid ? <p className="field-error" role="status">Use uma quantidade numérica maior que zero.</p> : null}
    </section>
  )
}
