import { X } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import type { RecipeSummary } from '../../recipes/data/recipe-repository'
import { formatAmount, parseAmount } from '../../recipes/domain/amount'
import type { Rational } from '../../recipes/domain/types'
import { addDaysDateOnly, todayDateOnly } from '../../planner/domain/date-only'
import type { ConsolidatedShoppingItem } from '../domain/types'

export interface RecipeGenerationRequest {
  recipeId: string
  servings: Rational | null
}

interface PreviewRow {
  item: ConsolidatedShoppingItem
  amountText: string
}

interface AddRecipesToShoppingProps {
  listName: string
  recipes: readonly RecipeSummary[]
  onBuildRecipePreview: (requests: RecipeGenerationRequest[]) => Promise<ConsolidatedShoppingItem[]>
  onBuildPlannerPreview: (range: { start: string; end: string }) => Promise<ConsolidatedShoppingItem[]>
  onConfirm: (items: ConsolidatedShoppingItem[]) => Promise<void> | void
  onClose: () => void
}

function normalizeName(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

export function AddRecipesToShopping({
  listName,
  recipes,
  onBuildRecipePreview,
  onBuildPlannerPreview,
  onConfirm,
  onClose,
}: AddRecipesToShoppingProps) {
  const today = useMemo(() => todayDateOnly(), [])
  const [mode, setMode] = useState<'recipes' | 'planner'>('recipes')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [servings, setServings] = useState<Record<string, string>>({})
  const [rangeStart, setRangeStart] = useState(today)
  const [rangeEnd, setRangeEnd] = useState(addDaysDateOnly(today, 6))
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleRecipe(recipeId: string) {
    setSelectedIds((current) => current.includes(recipeId)
      ? current.filter((id) => id !== recipeId)
      : [...current, recipeId])
    setPreview([])
  }

  async function buildPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      let items: ConsolidatedShoppingItem[]
      if (mode === 'recipes') {
        if (selectedIds.length === 0) {
          setError('Selecione pelo menos uma receita.')
          return
        }
        const requests: RecipeGenerationRequest[] = selectedIds.map((recipeId) => {
          const raw = servings[recipeId]?.trim() ?? ''
          if (!raw) return { recipeId, servings: null }
          const amount = parseAmount(raw)
          if (amount.kind !== 'numeric' || amount.value.numerator <= 0) {
            throw new Error('invalid_servings')
          }
          return { recipeId, servings: amount.value }
        })
        items = await onBuildRecipePreview(requests)
      } else {
        if (rangeStart > rangeEnd) {
          setError('A data inicial não pode vir depois da data final.')
          return
        }
        items = await onBuildPlannerPreview({ start: rangeStart, end: rangeEnd })
      }
      setPreview(items.map((item) => ({ item, amountText: formatAmount(item.amount) })))
      if (items.length === 0) setError('Nenhum ingrediente foi encontrado para essa seleção.')
    } catch (caught) {
      setError(caught instanceof Error && caught.message === 'invalid_servings'
        ? 'Use uma quantidade numérica de porções nas receitas selecionadas.'
        : 'Não foi possível montar a prévia com os dados locais.')
    } finally {
      setBusy(false)
    }
  }

  function updatePreview(index: number, changes: Partial<PreviewRow['item']> & { amountText?: string }) {
    setPreview((current) => current.map((row, rowIndex) => rowIndex === index
      ? {
          item: {
            ...row.item,
            ...changes,
            ...(typeof changes.name === 'string' ? { normalizedName: normalizeName(changes.name) } : {}),
          },
          amountText: changes.amountText ?? row.amountText,
        }
      : row))
  }

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      const items = preview.map((row) => ({
        ...row.item,
        name: row.item.name.trim(),
        normalizedName: normalizeName(row.item.name),
        amount: parseAmount(row.amountText),
        unit: row.item.unit?.trim() || null,
      }))
      if (items.some((item) => !item.name)) {
        setError('Todo item da prévia precisa de um nome.')
        return
      }
      await onConfirm(items)
      onClose()
    } catch {
      setError('Não foi possível adicionar a prévia à lista.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="shopping-generator" role="dialog" aria-modal="true" aria-labelledby="shopping-generator-title">
      <div className="shopping-generator__panel">
        <header className="shopping-generator__header">
          <div>
            <h2 id="shopping-generator-title">Gerar itens para {listName}</h2>
            <p>Revise a consolidação antes de adicionar qualquer item à lista.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar geração">
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="shopping-generator__mode" role="group" aria-label="Origem da geração">
          <button type="button" data-active={mode === 'recipes' || undefined} onClick={() => { setMode('recipes'); setPreview([]) }}>Receitas</button>
          <button type="button" data-active={mode === 'planner' || undefined} onClick={() => { setMode('planner'); setPreview([]) }}>Planejamento</button>
        </div>

        <form className="shopping-generator__form" onSubmit={buildPreview}>
          {mode === 'recipes' ? (
            <div className="shopping-generator__recipes">
              {recipes.length === 0 ? <p>Nenhuma receita local disponível.</p> : recipes.map((recipe) => {
                const selected = selectedIds.includes(recipe.id)
                return (
                  <div className="shopping-generator__recipe" key={recipe.id} data-selected={selected || undefined}>
                    <label>
                      <input type="checkbox" checked={selected} onChange={() => toggleRecipe(recipe.id)} />
                      <span>{recipe.title}</span>
                    </label>
                    {selected ? (
                      <label className="field-stack">
                        <span>Porções</span>
                        <input
                          value={servings[recipe.id] ?? ''}
                          onChange={(event) => setServings((current) => ({ ...current, [recipe.id]: event.target.value }))}
                          placeholder={recipe.baseYield ? `${recipe.baseYield.numerator / recipe.baseYield.denominator}` : 'Padrão'}
                          inputMode="decimal"
                        />
                      </label>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="shopping-generator__range">
              <label className="field-stack">
                <span>De</span>
                <input type="date" value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} required />
              </label>
              <label className="field-stack">
                <span>Até</span>
                <input type="date" value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} required />
              </label>
              <p>Serão usados os preparos planejados nesse intervalo e as porções configuradas em cada refeição.</p>
            </div>
          )}
          <button type="submit" className="button button--quiet" disabled={busy}>{busy ? 'Montando…' : 'Montar prévia'}</button>
        </form>

        {error ? <p className="auth-error" role="alert">{error}</p> : null}

        {preview.length > 0 ? (
          <section className="shopping-preview" aria-labelledby="shopping-preview-title">
            <header>
              <h3 id="shopping-preview-title">Prévia consolidada</h3>
              <span>{preview.length} {preview.length === 1 ? 'item' : 'itens'}</span>
            </header>
            <div className="shopping-preview__items">
              {preview.map((row, index) => (
                <div className="shopping-preview__item" key={`${row.item.normalizedName}-${index}`}>
                  <label className="field-stack shopping-preview__name">
                    <span>Item</span>
                    <input value={row.item.name} onChange={(event) => updatePreview(index, { name: event.target.value })} />
                  </label>
                  <label className="field-stack">
                    <span>Quantidade</span>
                    <input value={row.amountText} onChange={(event) => updatePreview(index, { amountText: event.target.value })} />
                  </label>
                  <label className="field-stack">
                    <span>Unidade</span>
                    <input value={row.item.unit ?? ''} onChange={(event) => updatePreview(index, { unit: event.target.value || null })} />
                  </label>
                  <div className="shopping-preview__meta">
                    <span>{row.item.sources.length} {row.item.sources.length === 1 ? 'origem' : 'origens'}</span>
                    {row.item.approximate ? <strong>Conversão aproximada</strong> : null}
                  </div>
                  <button
                    type="button"
                    className="button button--quiet"
                    onClick={() => setPreview((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
            <div className="shopping-preview__actions">
              <button type="button" className="button button--quiet" onClick={() => setPreview([])} disabled={busy}>Refazer</button>
              <button type="button" className="button button--primary" onClick={() => void confirm()} disabled={busy || preview.length === 0}>
                {busy ? 'Adicionando…' : `Adicionar ${preview.length} à lista`}
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
