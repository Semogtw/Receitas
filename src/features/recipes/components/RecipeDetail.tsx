import { useMemo, useState } from 'react'
import { formatAmount } from '../domain/amount'
import { scaleRecipeIngredients } from '../domain/scaling'
import type { ConversionProfile, Rational } from '../domain/types'
import type { RecipeAggregate } from '../data/recipe-repository'
import { ServingControl } from './ServingControl'
import { UnitConversionControl } from './UnitConversionControl'

interface RecipeDetailProps {
  recipe: RecipeAggregate
  conversionProfiles?: readonly ConversionProfile[]
  onEdit(): void
  onDelete(): void | Promise<void>
  onBack?: () => void
}

const identityMultiplier: Rational = { numerator: 1, denominator: 1 }

function timeLabel(seconds: number | null): string | null {
  if (seconds === null) return null
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`
}

export function RecipeDetail({ recipe, conversionProfiles = [], onEdit, onDelete, onBack }: RecipeDetailProps) {
  const [multiplier, setMultiplier] = useState<Rational>(identityMultiplier)
  const ingredients = useMemo(
    () => scaleRecipeIngredients(recipe.ingredients, multiplier),
    [recipe.ingredients, multiplier],
  )

  const prep = timeLabel(recipe.prepTimeSeconds)
  const cook = timeLabel(recipe.cookTimeSeconds)
  const total = timeLabel(recipe.totalTimeSeconds)

  return (
    <article className="recipe-detail">
      <header className="recipe-detail__header">
        <div>
          <p className="route-kicker">Receita</p>
          <h1>{recipe.title}</h1>
          {recipe.description ? <p className="recipe-detail__description">{recipe.description}</p> : null}
        </div>
        <div className="recipe-detail__actions">
          {onBack ? <button type="button" className="button button--quiet" onClick={onBack}>Voltar</button> : null}
          <button type="button" className="button button--quiet" onClick={onEdit}>Editar receita</button>
          <button type="button" className="button button--quiet" onClick={() => void onDelete()}>Mover para a lixeira</button>
        </div>
      </header>

      <div className="recipe-detail__meta" aria-label="Resumo da receita">
        {recipe.favorite ? <span>Favorita</span> : null}
        {recipe.wantToMake ? <span>Queremos fazer</span> : null}
        {prep ? <span>Preparo {prep}</span> : null}
        {cook ? <span>Cozimento {cook}</span> : null}
        {total ? <span>Total {total}</span> : null}
      </div>

      {recipe.baseYield ? (
        <ServingControl
          baseYield={recipe.baseYield}
          baseYieldUnit={recipe.baseYieldUnit}
          onMultiplierChange={setMultiplier}
        />
      ) : null}

      <section className="recipe-detail__section" aria-labelledby="recipe-ingredients-title">
        <div className="recipe-detail__section-heading">
          <p className="route-kicker">Ingredientes</p>
          <h2 id="recipe-ingredients-title">O que usar</h2>
        </div>
        {ingredients.length === 0 ? (
          <p className="recipe-detail__empty">Esta receita ainda não tem ingredientes cadastrados.</p>
        ) : (
          <ul className="recipe-ingredient-list">
            {ingredients.map((ingredient) => {
              const amount = formatAmount(ingredient.amount)
              const main = [amount, ingredient.unit, ingredient.name].filter(Boolean).join(' ')
              return (
                <li key={ingredient.id}>
                  <div className="recipe-ingredient-list__content">
                    <span className="recipe-ingredient-list__main">{main}</span>
                    {ingredient.note ? <span className="recipe-ingredient-list__note">{ingredient.note}</span> : null}
                    {ingredient.unit && ingredient.amount.kind === 'numeric' ? (
                      <UnitConversionControl
                        amount={ingredient.amount}
                        unit={ingredient.unit}
                        ingredientKey={ingredient.normalizedName || ingredient.name}
                        pairOverrides={conversionProfiles}
                      />
                    ) : null}
                  </div>
                  <div className="recipe-ingredient-list__flags">
                    {ingredient.isApproximate ? <span>Aproximado</span> : null}
                    {ingredient.isOptional ? <span>Opcional</span> : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="recipe-detail__section" aria-labelledby="recipe-steps-title">
        <div className="recipe-detail__section-heading">
          <p className="route-kicker">Preparo</p>
          <h2 id="recipe-steps-title">Passo a passo</h2>
        </div>
        {recipe.steps.length === 0 ? (
          <p className="recipe-detail__empty">Esta receita ainda não tem etapas cadastradas.</p>
        ) : (
          <ol className="recipe-step-list">
            {recipe.steps.map((step) => (
              <li key={step.id}>
                <div className="recipe-step-list__number" aria-hidden="true">{step.position + 1}</div>
                <div>
                  <p>{step.instruction}</p>
                  <div className="recipe-step-list__meta">
                    {step.durationSeconds ? <span>{timeLabel(step.durationSeconds)}</span> : null}
                    {step.note ? <span>{step.note}</span> : null}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </article>
  )
}
