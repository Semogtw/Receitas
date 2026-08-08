import { useMemo, useState } from 'react'
import { formatAmount } from '../domain/amount'
import { convertAmount } from '../domain/conversions'
import type { ConversionProfile, IngredientAmount } from '../domain/types'

interface UnitConversionControlProps {
  amount: IngredientAmount
  unit: string
  ingredientKey: string
  pairOverrides?: readonly ConversionProfile[]
}

const unitOptions = [
  { value: 'ml', label: 'mL' },
  { value: 'l', label: 'L' },
  { value: 'tsp', label: 'colher de chá' },
  { value: 'tbsp', label: 'colheres de sopa' },
  { value: 'cup', label: 'xícara' },
  { value: 'g', label: 'g' },
  { value: 'kg', label: 'kg' },
] as const

const unitLabel = new Map(unitOptions.map((unit) => [unit.value, unit.label]))

export function UnitConversionControl({ amount, unit, ingredientKey, pairOverrides = [] }: UnitConversionControlProps) {
  const [targetUnit, setTargetUnit] = useState('')
  const result = useMemo(() => {
    if (!targetUnit) return null
    return convertAmount({
      amount,
      fromUnit: unit,
      toUnit: targetUnit,
      ingredientKey,
      pairOverrides,
    })
  }, [amount, ingredientKey, pairOverrides, targetUnit, unit])

  if (amount.kind !== 'numeric') return null

  return (
    <div className="unit-conversion-control">
      <label>
        <span className="sr-only">Conversão temporária</span>
        <select
          aria-label={`Converter unidade de ${ingredientKey}`}
          value={targetUnit}
          onChange={(event) => setTargetUnit(event.currentTarget.value)}
        >
          <option value="">Converter para…</option>
          {unitOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      {result?.status === 'converted' ? (
        <output className="unit-conversion-control__result">
          {result.approximate ? '≈ ' : ''}{formatAmount(result.amount)} {unitLabel.get(targetUnit) ?? targetUnit}
        </output>
      ) : null}
      {result?.status === 'unavailable' ? (
        <span className="unit-conversion-control__unavailable">
          Conversão indisponível sem um perfil confiável para este ingrediente.
        </span>
      ) : null}
    </div>
  )
}
