import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ConversionProfile } from '../domain/types'
import { UnitConversionControl } from './UnitConversionControl'

describe('UnitConversionControl', () => {
  it('shows exact temporary conversions without mutating the ingredient', async () => {
    const user = userEvent.setup()
    render(
      <UnitConversionControl
        amount={{ kind: 'numeric', value: { numerator: 1, denominator: 1 } }}
        unit="xícara"
        ingredientKey="água"
      />,
    )

    await user.selectOptions(screen.getByLabelText('Converter unidade de água'), 'tbsp')
    expect(screen.getByText('16 colheres de sopa')).toBeInTheDocument()
  })

  it('uses pair density overrides for approximate mass-volume conversion', async () => {
    const user = userEvent.setup()
    const pairOverrides: ConversionProfile[] = [
      { ingredientKey: 'farinha', gramsPerMilliliter: 0.625, source: 'pair_override' },
    ]
    render(
      <UnitConversionControl
        amount={{ kind: 'numeric', value: { numerator: 1, denominator: 1 } }}
        unit="xícara"
        ingredientKey="farinha"
        pairOverrides={pairOverrides}
      />,
    )

    await user.selectOptions(screen.getByLabelText('Converter unidade de farinha'), 'g')
    expect(screen.getByText('≈ 150 g')).toBeInTheDocument()
  })

  it('says unavailable instead of guessing when a density profile is missing', async () => {
    const user = userEvent.setup()
    render(
      <UnitConversionControl
        amount={{ kind: 'numeric', value: { numerator: 1, denominator: 1 } }}
        unit="xícara"
        ingredientKey="ingrediente desconhecido"
      />,
    )

    await user.selectOptions(screen.getByLabelText('Converter unidade de ingrediente desconhecido'), 'g')
    expect(screen.getByText(/Conversão indisponível/)).toBeInTheDocument()
  })
})
