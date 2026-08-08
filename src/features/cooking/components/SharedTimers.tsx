import { useEffect, useState, type FormEvent } from 'react'
import {
  createCookingTimer,
  pauseCookingTimer,
  remainingTimerSeconds,
  resumeCookingTimer,
  startCookingTimer,
  type CookingTimer,
} from '../domain/timers'

interface SharedTimersProps {
  timers: readonly CookingTimer[]
  onChange(timers: CookingTimer[]): void | Promise<void>
}

function clockLabel(totalSeconds: number): string {
  const seconds = Math.max(0, totalSeconds)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

export function SharedTimers({ timers, onChange }: SharedTimersProps) {
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [label, setLabel] = useState('')
  const [minutes, setMinutes] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!timers.some((timer) => timer.targetAt !== null)) return
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [timers])

  function replaceTimer(id: string, next: CookingTimer): void {
    void onChange(timers.map((timer) => timer.id === id ? next : { ...timer }))
  }

  function removeTimer(id: string): void {
    void onChange(timers.filter((timer) => timer.id !== id).map((timer) => ({ ...timer })))
  }

  function addTimer(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    setError(null)
    const parsedMinutes = Number(minutes.replace(',', '.'))
    const durationSeconds = parsedMinutes * 60
    if (!Number.isFinite(parsedMinutes) || parsedMinutes <= 0 || !Number.isSafeInteger(durationSeconds)) {
      setError('A duração precisa resultar em um número inteiro de segundos maior que zero.')
      return
    }

    try {
      const timer = createCookingTimer(label, durationSeconds)
      void onChange([...timers.map((item) => ({ ...item })), timer])
      setLabel('')
      setMinutes('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível adicionar o timer.')
    }
  }

  return (
    <section className="cooking-timers" aria-labelledby="cooking-timers-title">
      <div>
        <p className="route-kicker">Neste dispositivo</p>
        <h2 id="cooking-timers-title">Timers</h2>
        <p className="cooking-timers__intro">Os deadlines ficam no rascunho local e continuam corretos depois que a tela volta do bloqueio.</p>
      </div>

      {timers.length > 0 ? (
        <div className="cooking-timers__list">
          {timers.map((timer) => {
            const remaining = remainingTimerSeconds(timer, nowMs)
            const isRunning = timer.targetAt !== null && remaining > 0
            const hasStarted = timer.pausedRemainingSeconds !== timer.durationSeconds
            return (
              <article key={timer.id} className="cooking-timer">
                <div>
                  <strong>{timer.label}</strong>
                  <time>{clockLabel(remaining)}</time>
                </div>
                <div className="cooking-timer__actions">
                  {isRunning ? (
                    <button
                      type="button"
                      className="button button--quiet"
                      aria-label={`Pausar timer ${timer.label}`}
                      onClick={() => replaceTimer(timer.id, pauseCookingTimer(timer, Date.now()))}
                    >Pausar</button>
                  ) : (
                    <button
                      type="button"
                      className="button button--quiet"
                      aria-label={`${hasStarted ? 'Retomar' : 'Iniciar'} timer ${timer.label}`}
                      onClick={() => replaceTimer(
                        timer.id,
                        hasStarted ? resumeCookingTimer(timer, Date.now()) : startCookingTimer(timer, Date.now()),
                      )}
                    >{hasStarted ? 'Retomar' : 'Iniciar'}</button>
                  )}
                  <button
                    type="button"
                    className="button button--quiet"
                    aria-label={`Remover timer ${timer.label}`}
                    onClick={() => removeTimer(timer.id)}
                  >Remover</button>
                </div>
              </article>
            )
          })}
        </div>
      ) : <p className="cooking-timers__empty">Nenhum timer neste preparo.</p>}

      <form className="cooking-timers__add" onSubmit={addTimer}>
        <label>
          <span>Nome do timer</span>
          <input aria-label="Nome do timer" value={label} placeholder="Forno" onChange={(event) => setLabel(event.currentTarget.value)} />
        </label>
        <label>
          <span>Duração (min)</span>
          <input
            aria-label="Duração do timer em minutos"
            inputMode="decimal"
            value={minutes}
            placeholder="10"
            onChange={(event) => setMinutes(event.currentTarget.value)}
          />
        </label>
        <button type="submit" className="button button--quiet">Adicionar timer</button>
      </form>
      {error ? <p className="field-error" role="alert">{error}</p> : null}
    </section>
  )
}
