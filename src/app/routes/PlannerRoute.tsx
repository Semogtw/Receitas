import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PowerSyncDatabase } from '@powersync/web'
import { usePowerSyncDatabase } from '../../data/PowerSyncProvider'
import { useAuth } from '../../features/auth/AuthProvider'
import { MealPeriodSettings } from '../../features/planner/components/MealPeriodSettings'
import { MealPlanEditor } from '../../features/planner/components/MealPlanEditor'
import { PlannerView } from '../../features/planner/components/PlannerView'
import { PlannerRepository } from '../../features/planner/data/planner-repository'
import { todayDateOnly, weekDates } from '../../features/planner/domain/date-only'
import type { MealPlanEntry, MealPlanEntryInput } from '../../features/planner/domain/types'
import { RecipeRepository, type RecipeSummary } from '../../features/recipes/data/recipe-repository'

export function PlannerRoute() {
  const auth = useAuth()
  const database = usePowerSyncDatabase()
  const [selectedDate, setSelectedDate] = useState(() => todayDateOnly())
  const [periods, setPeriods] = useState<Awaited<ReturnType<PlannerRepository['listMealPeriods']>>>([])
  const [entries, setEntries] = useState<MealPlanEntry[]>([])
  const [recipes, setRecipes] = useState<RecipeSummary[]>([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<MealPlanEntry | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const repositories = useMemo(() => {
    if (!auth.userId || !auth.pairId) return null
    const scope = { pairId: auth.pairId, actorUserId: auth.userId }
    return {
      planner: new PlannerRepository(database, scope),
      recipes: new RecipeRepository(database, scope),
    }
  }, [auth.userId, auth.pairId, database])

  const week = useMemo(() => weekDates(selectedDate), [selectedDate])
  const weekStart = week[0]!
  const weekEnd = week[6]!

  const refresh = useCallback(async () => {
    if (!repositories) return
    const [nextPeriods, nextEntries, nextRecipes] = await Promise.all([
      repositories.planner.listMealPeriods(),
      repositories.planner.listEntries({ start: weekStart, end: weekEnd }),
      repositories.recipes.listRecipes(),
    ])
    setPeriods(nextPeriods)
    setEntries(nextEntries)
    setRecipes(nextRecipes)
  }, [repositories, weekEnd, weekStart])

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!repositories) {
        if (active) setLoading(false)
        return
      }
      setLoading(true)
      try {
        await refresh()
        if (active) setError(null)
      } catch {
        if (active) setError('Não foi possível carregar o planejamento local agora.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [refresh, repositories])

  useEffect(() => {
    if (!repositories) return
    const listener = database.registerListener({
      crudUpdate: () => void refresh().catch(() => setError('Não foi possível atualizar o planejamento local.')),
    } as Parameters<PowerSyncDatabase['registerListener']>[0]) as unknown
    return () => {
      if (typeof listener === 'function') listener()
    }
  }, [database, refresh, repositories])

  async function saveEntry(input: MealPlanEntryInput & { id?: string }) {
    if (!repositories) return
    await repositories.planner.upsertEntry(input)
    setEditorOpen(false)
    setEditingEntry(null)
    await refresh()
  }

  async function deleteEntry(entry: MealPlanEntry) {
    if (!repositories) return
    try {
      await repositories.planner.softDeleteEntry(entry.id)
      await refresh()
      setError(null)
    } catch {
      setError('Não foi possível remover esta refeição do planejamento.')
    }
  }

  async function createPeriod(name: string) {
    if (!repositories) return
    await repositories.planner.createMealPeriod(name)
    await refresh()
  }

  async function renamePeriod(id: string, name: string) {
    if (!repositories) return
    await repositories.planner.renameMealPeriod(id, name)
    await refresh()
  }

  async function reorderPeriods(ids: string[]) {
    if (!repositories) return
    await repositories.planner.reorderMealPeriods(ids)
    await refresh()
  }

  if (!repositories) {
    return (
      <section className="route-section" aria-labelledby="planner-title">
        <p className="route-kicker">Agenda da cozinha</p>
        <h1 id="planner-title">Planejar</h1>
        <p className="route-intro">O planejamento local ainda não está disponível para esta sessão.</p>
      </section>
    )
  }

  return (
    <>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      {loading ? <p className="planner-loading" role="status">Carregando planejamento local…</p> : null}
      {!loading ? (
        <PlannerView
          selectedDate={selectedDate}
          periods={periods}
          entries={entries}
          recipes={recipes}
          onSelectDate={setSelectedDate}
          onAdd={() => { setEditingEntry(null); setEditorOpen(true) }}
          onEdit={(entry) => { setEditingEntry(entry); setSelectedDate(entry.date); setEditorOpen(true) }}
          onDelete={(entry) => void deleteEntry(entry)}
          onOpenPeriodSettings={() => setSettingsOpen(true)}
        />
      ) : null}

      {editorOpen ? (
        <MealPlanEditor
          date={editingEntry?.date ?? selectedDate}
          recipes={recipes}
          periods={periods}
          initial={editingEntry}
          onSave={saveEntry}
          onCancel={() => { setEditorOpen(false); setEditingEntry(null) }}
        />
      ) : null}

      {settingsOpen ? (
        <MealPeriodSettings
          periods={periods}
          onCreate={createPeriod}
          onRename={renamePeriod}
          onReorder={reorderPeriods}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </>
  )
}
