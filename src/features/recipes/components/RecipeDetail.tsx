import { useMemo, useState } from 'react'
import { formatIngredientAmount, multiplyRational } from '../domain/amount'
import type { ConversionProfile } from '../domain/types'
import type { RecipeAggregate } from '../data/recipe-repository'
import { ServingControl } from './ServingControl'
import { UnitConversionControl } from './UnitConversionControl'

interface RecipeDetailProps {
  recipe: RecipeAggregate
  conversionProfiles?: ConversionProfile[]
  onBack?: () => void
  onCook?: () => void
  onEdit: () => void
  onDelete: () => void
}

function formatMinutes(seconds: number | null): string | null {
  if (seconds === null) return null
  const minutes = Math.round(seconds / 60)
  return `${minutes} min`
}

export function RecipeDetail({
  recipe,
  conversionProfiles = [],
  onBack,
  onCook,
  onEdit,
  onDelete,
}: RecipeDetailProps) {
  const [multiplier, setMultiplier] = useState({ numerator: 1, denominator: 1 })
  const [convertedUnits, setConvertedUnits] = useState<Record<string, string | null>>({})

  const displayedYield = useMemo(
    () => recipe.baseYield ? multiplyRational(recipe.baseYield, multiplier) : null,
    [multiplier, recipe.baseYield],
  )

  return (
    <article className="recipe-detail">
      <header className="recipe-detail__header">
        <div>
          <p className="route-kicker">Receita</p>
          <h1>{recipe.title}</h1>
          {recipe.description ? <p className="route-intro">{recipe.description}</p> : null}
        </div>
        <div className="recipe-detail__actions">
          {onBack ? <button type="button" className="button button--quiet" onClick={onBack}>Voltar</button> : null}
          {onCook ? <button type="button" className="button button--primary" onClick={onCook}>Cozinhar agora</button> : null}
          <button type="button" className="button button--quiet" onClick={onEdit}>Editar receita</button>
          <button type="button" className="button button--danger" onClick={onDelete}>Mover para a lixeira</button>
        </div>
      </header>

      <div className="recipe-detail__facts" aria-label="Resumo da receita">
        {displayedYield ? (
          <span>{formatIngredientAmount({ kind: 'numeric', value: displayedYield })} {recipe.baseYieldUnit ?? 'porções'}</span>
        ) : null}
        {formatMinutes(recipe.prepTimeSeconds) ? <span>Preparo {formatMinutes(recipe.prepTimeSeconds)}</span> : null}
        {formatMinutes(recipe.cookTimeSeconds) ? <span>Cozimento {formatMinutes(recipe.cookTimeSeconds)}</span> : null}
        {formatMinutes(recipe.totalTimeSeconds) ? <span>Total {formatMinutes(recipe.totalTimeSeconds)}</span> : null}
        {recipe.favorite ? <span>★ Favorita</span> : null}
        {recipe.wantToMake ? <span>Queremos fazer</span> : null}
      </div>

      {recipe.baseYield ? (
        <ServingControl
          baseYield={recipe.baseYield}
          baseYieldUnit={recipe.baseYieldUnit}
          multiplier={multiplier}
          onChange={setMultiplier}
        />
      ) : null}

      <section className="recipe-detail__section" aria-labelledby="recipe-ingredients-title">
        <div className="recipe-detail__section-heading">
          <div>
            <p className="route-kicker">Ingredientes</p>
            <h2 id="recipe-ingredients-title">Para preparar</h2>
          </div>
        </div>
        {recipe.ingredients.length === 0 ? <p>Nenhum ingrediente cadastrado.</p> : (
          <ul className="recipe-detail__ingredients">
            {recipe.ingredients.map((ingredient) => (
              <li key={ingredient.id}>
                <div className="recipe-detail__ingredient-line">
                  <span>
                    {ingredient.isApproximate ? <span aria-label="aproximadamente">≈ </span> : null}
                    {ingredient.amount ? `${formatIngredientAmount(
                      ingredient.amount.kind === 'numeric'
                        ? { kind: 'numeric', value: multiplyRational(ingredient.amount.value, multiplier) }
                        : ingredient.amount,
                    )} ` : null}
                    {convertedUnits[ingredient.id] ?? ingredient.unit ? `${convertedUnits[ingredient.id] ?? ingredient.unit} ` : null}
                    <strong>{ingredient.name}</strong>
                    {ingredient.isOptional ? ' · opcional' : ''}
                    {ingredient.note ? ` · ${ingredient.note}` : ''}
                  </span>
                  <UnitConversionControl
                    ingredient={ingredient}
                    profiles={conversionProfiles}
                    multiplier={multiplier}
                    value={convertedUnits[ingredient.id] ?? null}
                    onChange={(unit) => setConvertedUnits((current) => ({ ...current, [ingredient.id]: unit }))}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="recipe-detail__section" aria-labelledby="recipe-steps-title">
        <div className="recipe-detail__section-heading">
          <div>
            <p className="route-kicker">Modo de preparo</p>
            <h2 id="recipe-steps-title">Passo a passo</h2>
          </div>
        </div>
        {recipe.steps.length === 0 ? <p>Nenhuma etapa cadastrada.</p> : (
          <ol className="recipe-detail__steps">
            {recipe.steps.map((step) => (
              <li key={step.id}>
                <div>
                  <strong>{step.instruction}</strong>
                  {step.durationSeconds ? <span>{formatMinutes(step.durationSeconds)}</span> : null}
                  {step.note ? <p>{step.note}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </article>
  )
}
