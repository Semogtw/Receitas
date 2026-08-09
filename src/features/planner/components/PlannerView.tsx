import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Plus, Settings2, Trash2 } from 'lucide-react'
import type { RecipeSummary } from '../../recipes/data/recipe-repository'
import { addDaysDateOnly, formatPlannerDate, weekDates } from '../domain/date-only'
import type { MealPeriod, MealPlanEntry } from '../domain/types'

interface PlannerViewProps {
  selectedDate: string
  periods: readonly MealPeriod[]
  entries: readonly MealPlanEntry[]
  recipes: readonly RecipeSummary[]
  onSelectDate: (date: string) => void
  onAdd: () => void
  onEdit: (entry: MealPlanEntry) => void
  onDelete: (entry: MealPlanEntry) => void
  onOpenPeriodSettings: () => void
}

function servingLabel(entry: MealPlanEntry): string | null {
  if (!entry.servings) return null
  const { numerator, denominator } = entry.servings
  if (denominator === 1) return `${numerator} porç${numerator === 1 ? 'ão' : 'ões'}`
  return `${numerator}/${denominator} porções`
}

export function PlannerView({
  selectedDate,
  periods,
  entries,
  recipes,
  onSelectDate,
  onAdd,
  onEdit,
  onDelete,
  onOpenPeriodSettings,
}: PlannerViewProps) {
  const dates = weekDates(selectedDate)
  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]))
  const entriesForDate = entries.filter((entry) => entry.date === selectedDate)

  return (
    <section className="planner-workspace" aria-labelledby="planner-title">
      <header className="planner-workspace__header">
        <div>
          <p className="route-kicker">Agenda da cozinha</p>
          <h1 id="planner-title">Planejar</h1>
          <p className="route-intro">Organize as refeições por dia e período sem depender da internet.</p>
        </div>
        <div className="planner-workspace__actions">
          <button type="button" className="button button--quiet" onClick={onOpenPeriodSettings}>
            <Settings2 aria-hidden="true" /> Períodos
          </button>
          <button type="button" className="button button--primary" onClick={onAdd} disabled={recipes.length === 0 || periods.length === 0}>
            <Plus aria-hidden="true" /> Refeição
          </button>
        </div>
      </header>

      <div className="planner-week" aria-label="Semana selecionada">
        <div className="planner-week__navigation">
          <button
            type="button"
            className="icon-button"
            aria-label="Semana anterior"
            onClick={() => onSelectDate(addDaysDateOnly(selectedDate, -7))}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <strong>{formatPlannerDate(dates[0]!, { day: '2-digit', month: 'short' })} – {formatPlannerDate(dates[6]!, { day: '2-digit', month: 'short', year: 'numeric' })}</strong>
          <button
            type="button"
            className="icon-button"
            aria-label="Próxima semana"
            onClick={() => onSelectDate(addDaysDateOnly(selectedDate, 7))}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>

        <div className="planner-week__days">
          {dates.map((date) => {
            const selected = date === selectedDate
            const count = entries.filter((entry) => entry.date === date).length
            return (
              <button
                type="button"
                key={date}
                className="planner-day"
                data-selected={selected || undefined}
                aria-pressed={selected}
                onClick={() => onSelectDate(date)}
              >
                <span>{formatPlannerDate(date, { weekday: 'short' }).replace('.', '')}</span>
                <strong>{formatPlannerDate(date, { day: '2-digit' })}</strong>
                <small aria-label={`${count} refeições`}>{count || '—'}</small>
              </button>
            )
          })}
        </div>
      </div>

      <div className="planner-agenda">
        <header className="planner-agenda__header">
          <div>
            <CalendarDays aria-hidden="true" />
            <h2>{formatPlannerDate(selectedDate, { weekday: 'long', day: '2-digit', month: 'long' })}</h2>
          </div>
          <span>{entriesForDate.length} {entriesForDate.length === 1 ? 'refeição' : 'refeições'}</span>
        </header>

        {periods.length === 0 ? (
          <div className="planner-empty">
            <h3>Crie o primeiro período</h3>
            <p>Adicione períodos como Café, Almoço ou Jantar para começar a montar a agenda.</p>
            <button type="button" className="button button--quiet" onClick={onOpenPeriodSettings}>Configurar períodos</button>
          </div>
        ) : null}

        {periods.map((period) => {
          const periodEntries = entriesForDate.filter((entry) => entry.mealPeriodId === period.id)
          return (
            <section className="planner-period" key={period.id} aria-labelledby={`planner-period-${period.id}`}>
              <header className="planner-period__header">
                <h3 id={`planner-period-${period.id}`}>{period.name}</h3>
                <span>{periodEntries.length || '—'}</span>
              </header>

              {periodEntries.length === 0 ? (
                <button type="button" className="planner-period__empty" onClick={onAdd}>
                  <Plus aria-hidden="true" /> Adicionar refeição
                </button>
              ) : (
                <div className="planner-period__entries">
                  {periodEntries.map((entry) => {
                    const recipe = recipeById.get(entry.recipeId)
                    const servings = servingLabel(entry)
                    return (
                      <article className="planner-entry" key={entry.id}>
                        <button type="button" className="planner-entry__body" onClick={() => onEdit(entry)}>
                          <strong>{recipe?.title ?? 'Receita indisponível localmente'}</strong>
                          <span className="planner-entry__meta">
                            {entry.time ? <span><Clock3 aria-hidden="true" /> {entry.time.slice(0, 5)}</span> : null}
                            {servings ? <span>{servings}</span> : null}
                          </span>
                          {entry.note ? <span className="planner-entry__note">{entry.note}</span> : null}
                        </button>
                        <button
                          type="button"
                          className="icon-button planner-entry__delete"
                          aria-label={`Remover ${recipe?.title ?? 'refeição'} do planejamento`}
                          onClick={() => onDelete(entry)}
                        >
                          <Trash2 aria-hidden="true" />
                        </button>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </section>
  )
}
