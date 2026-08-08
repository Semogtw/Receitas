import type { CookingSnapshotStep } from '../domain/cooking-session'

interface CookingStepViewProps {
  step: CookingSnapshotStep
  index: number
  total: number
  onPrevious(): void
  onNext(): void
  onFinish(): void
}

function durationLabel(seconds: number | null): string | null {
  if (seconds === null) return null
  const minutes = seconds / 60
  if (Number.isInteger(minutes)) return `${minutes} min`
  return `${seconds} s`
}

export function CookingStepView({ step, index, total, onPrevious, onNext, onFinish }: CookingStepViewProps) {
  const isLast = index === total - 1
  const duration = durationLabel(step.durationSeconds)

  return (
    <section className="cooking-step" aria-labelledby={`cooking-step-${step.id}`}>
      <div className="cooking-step__progress" aria-live="polite">Etapa {index + 1} de {total}</div>
      <h2 id={`cooking-step-${step.id}`}>{step.instruction}</h2>
      <div className="cooking-step__meta">
        {duration ? <span>{duration}</span> : null}
        {step.note ? <span>{step.note}</span> : null}
      </div>
      <div className="cooking-step__actions">
        <button type="button" className="button button--quiet" disabled={index === 0} onClick={onPrevious}>Etapa anterior</button>
        {isLast ? (
          <button type="button" className="button button--primary" onClick={onFinish}>Finalizar preparo</button>
        ) : (
          <button type="button" className="button button--primary" onClick={onNext}>Próxima etapa</button>
        )}
      </div>
    </section>
  )
}
