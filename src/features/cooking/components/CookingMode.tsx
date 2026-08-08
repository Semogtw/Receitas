import { formatAmount, multiplyRational } from '../../recipes/domain/amount'
import type { IngredientAmount } from '../../recipes/domain/types'
import type { CookingDraft } from '../domain/cooking-draft'
import { CookingStepView } from './CookingStepView'
import { SharedTimers } from './SharedTimers'

interface CookingModeProps {
  draft: CookingDraft
  onDraftChange(draft: CookingDraft): void | Promise<void>
  onFinish(): void
  onExit(): void
}

function scaledAmount(amount: IngredientAmount, draft: CookingDraft): IngredientAmount {
  if (amount.kind !== 'numeric') return amount
  return {
    kind: 'numeric',
    value: multiplyRational(amount.value, draft.servingMultiplier),
  }
}

export function CookingMode({ draft, onDraftChange, onFinish, onExit }: CookingModeProps) {
  const snapshot = draft.recipeSnapshot
  const currentStep = snapshot.steps[draft.currentStepIndex]
  const targetYield = snapshot.baseYield
    ? multiplyRational(snapshot.baseYield, draft.servingMultiplier)
    : null

  function updateStep(nextIndex: number): void {
    if (nextIndex < 0 || nextIndex >= snapshot.steps.length) return
    void onDraftChange({ ...draft, currentStepIndex: nextIndex })
  }

  return (
    <article className="cooking-mode">
      <header className="cooking-mode__header">
        <div>
          <p className="route-kicker">Modo cozinhar</p>
          <h1>{snapshot.title}</h1>
          <p>
            Snapshot da revisão {snapshot.recipeRevision}
            {targetYield ? ` · ${formatAmount({ kind: 'numeric', value: targetYield })}${snapshot.baseYieldUnit ? ` ${snapshot.baseYieldUnit}` : ''}` : ''}
          </p>
        </div>
        <button type="button" className="button button--quiet" onClick={onExit}>Sair do modo cozinhar</button>
      </header>

      <details className="cooking-mode__ingredients">
        <summary>Ingredientes deste preparo</summary>
        {snapshot.ingredients.length === 0 ? (
          <p>Nenhum ingrediente cadastrado no snapshot.</p>
        ) : (
          <ul>
            {snapshot.ingredients.map((ingredient) => {
              const amount = scaledAmount(ingredient.amount, draft)
              return (
                <li key={ingredient.id}>
                  {[formatAmount(amount), ingredient.unit, ingredient.name].filter(Boolean).join(' ')}
                  {ingredient.isOptional ? ' · opcional' : ''}
                </li>
              )
            })}
          </ul>
        )}
      </details>

      {currentStep ? (
        <CookingStepView
          step={currentStep}
          index={draft.currentStepIndex}
          total={snapshot.steps.length}
          onPrevious={() => updateStep(draft.currentStepIndex - 1)}
          onNext={() => updateStep(draft.currentStepIndex + 1)}
          onFinish={onFinish}
        />
      ) : (
        <section className="cooking-step cooking-step--empty">
          <p>Esta receita não tem etapas cadastradas.</p>
          <button type="button" className="button button--primary" onClick={onFinish}>Finalizar preparo</button>
        </section>
      )}

      <SharedTimers
        timers={draft.timers}
        onChange={(timers) => onDraftChange({ ...draft, timers })}
      />
    </article>
  )
}
