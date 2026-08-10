import { useEffect, useState, type FormEvent } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react'
import type { MealPeriod } from '../domain/types'

interface MealPeriodSettingsProps {
  periods: readonly MealPeriod[]
  onCreate: (name: string) => Promise<void> | void
  onRename: (id: string, name: string) => Promise<void> | void
  onReorder: (ids: string[]) => Promise<void> | void
  onDelete: (id: string) => Promise<void> | void
  onClose: () => void
}

export function MealPeriodSettings({ periods, onCreate, onRename, onReorder, onDelete, onClose }: MealPeriodSettingsProps) {
  const [names, setNames] = useState<Record<string, string>>({})
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setNames(Object.fromEntries(periods.map((period) => [period.id, period.name])))
  }, [periods])

  async function createPeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!newName.trim()) return
    setBusy(true)
    setError(null)
    try {
      await onCreate(newName)
      setNewName('')
    } catch {
      setError('Não foi possível criar o período.')
    } finally {
      setBusy(false)
    }
  }

  async function renamePeriod(period: MealPeriod) {
    const name = names[period.id]?.trim() ?? ''
    if (!name || name === period.name) return
    setBusy(true)
    setError(null)
    try {
      await onRename(period.id, name)
    } catch {
      setError('Não foi possível renomear o período.')
    } finally {
      setBusy(false)
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= periods.length) return
    const ids = periods.map((period) => period.id)
    ;[ids[index], ids[target]] = [ids[target]!, ids[index]!]
    setBusy(true)
    setError(null)
    try {
      await onReorder(ids)
    } catch {
      setError('Não foi possível reordenar os períodos.')
    } finally {
      setBusy(false)
    }
  }

  async function moveToTrash(period: MealPeriod) {
    setBusy(true)
    setError(null)
    try {
      await onDelete(period.id)
    } catch {
      setError('Não foi possível mover o período para a lixeira.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="planner-settings" role="dialog" aria-modal="true" aria-labelledby="planner-periods-title">
      <div className="planner-settings__panel">
        <header className="planner-settings__header">
          <div>
            <h2 id="planner-periods-title">Períodos das refeições</h2>
            <p>Crie nomes que façam sentido para a rotina de vocês e ajuste a ordem do dia.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar configurações">
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="planner-settings__list">
          {periods.map((period, index) => (
            <div className="planner-settings__row" key={period.id}>
              <label className="field-stack planner-settings__name">
                <span className="sr-only">Nome do período {index + 1}</span>
                <input
                  value={names[period.id] ?? period.name}
                  onChange={(event) => setNames((current) => ({ ...current, [period.id]: event.target.value }))}
                  onBlur={() => void renamePeriod(period)}
                  maxLength={80}
                />
              </label>
              <div className="planner-settings__reorder" aria-label={`Reordenar ${period.name}`}>
                <button
                  type="button"
                  className="icon-button"
                  disabled={busy || index === 0}
                  onClick={() => void move(index, -1)}
                  aria-label={`Mover ${period.name} para cima`}
                >
                  <ArrowUp aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  disabled={busy || index === periods.length - 1}
                  onClick={() => void move(index, 1)}
                  aria-label={`Mover ${period.name} para baixo`}
                >
                  <ArrowDown aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  disabled={busy}
                  onClick={() => void moveToTrash(period)}
                  aria-label={`Mover ${period.name} para a lixeira`}
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <form className="planner-settings__add" onSubmit={createPeriod}>
          <label className="field-stack">
            <span>Novo período</span>
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Ex.: Café da tarde"
              maxLength={80}
            />
          </label>
          <button type="submit" className="button button--quiet" disabled={busy || !newName.trim()}>
            <Plus aria-hidden="true" /> Adicionar
          </button>
        </form>

        {error ? <p className="auth-error" role="alert">{error}</p> : null}
      </div>
    </div>
  )
}
