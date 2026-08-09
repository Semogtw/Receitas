import { ListPlus, Pencil, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { formatAmount, parseAmount } from '../../recipes/domain/amount'
import type { ShoppingItem, ShoppingItemDraft, ShoppingItemPatch, ShoppingList, ShoppingSource } from '../domain/types'

interface ShoppingListDetailProps {
  list: ShoppingList
  items: readonly ShoppingItem[]
  onAddManual: (draft: ShoppingItemDraft) => Promise<void> | void
  onUpdate: (id: string, patch: ShoppingItemPatch) => Promise<void> | void
  onToggle: (id: string, purchased: boolean) => Promise<void> | void
  onDelete: (id: string) => Promise<void> | void
  onOpenGenerate: () => void
}

function normalizeIngredientName(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function sourceLabel(source: ShoppingSource): string {
  if (source.kind === 'manual') return 'Adicionado manualmente'
  if (source.kind === 'planner') return 'Gerado pelo planejamento'
  return 'Gerado por receita'
}

export function ShoppingListDetail({
  list,
  items,
  onAddManual,
  onUpdate,
  onToggle,
  onDelete,
  onOpenGenerate,
}: ShoppingListDetailProps) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editUnit, setEditUnit] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const remaining = items.filter((item) => !item.purchased).length

  async function addManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const itemName = name.trim()
    if (!itemName) return
    setBusyId('new')
    setError(null)
    try {
      await onAddManual({
        name: itemName,
        normalizedName: normalizeIngredientName(itemName),
        amount: parseAmount(amount),
        unit: unit.trim() || null,
        source: { kind: 'manual' },
      })
      setName('')
      setAmount('')
      setUnit('')
    } catch {
      setError('Não foi possível adicionar o item.')
    } finally {
      setBusyId(null)
    }
  }

  function beginEdit(item: ShoppingItem) {
    setEditingId(item.id)
    setEditAmount(formatAmount(item.amount))
    setEditUnit(item.unit ?? '')
    setError(null)
  }

  async function saveEdit(item: ShoppingItem) {
    setBusyId(item.id)
    setError(null)
    try {
      await onUpdate(item.id, {
        amount: parseAmount(editAmount),
        unit: editUnit.trim() || null,
      })
      setEditingId(null)
    } catch {
      setError('Não foi possível editar o item.')
    } finally {
      setBusyId(null)
    }
  }

  async function toggle(item: ShoppingItem) {
    setBusyId(item.id)
    setError(null)
    try {
      await onToggle(item.id, !item.purchased)
    } catch {
      setError('Não foi possível atualizar este item.')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(item: ShoppingItem) {
    setBusyId(item.id)
    setError(null)
    try {
      await onDelete(item.id)
    } catch {
      setError('Não foi possível remover este item.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="shopping-detail" aria-labelledby="shopping-detail-title">
      <header className="shopping-detail__header">
        <div>
          <p>{list.isDefault ? 'Lista padrão' : 'Lista compartilhada'}</p>
          <h2 id="shopping-detail-title">{list.name}</h2>
          <span>{remaining} {remaining === 1 ? 'item pendente' : 'itens pendentes'}</span>
        </div>
        <button type="button" className="button button--primary" onClick={onOpenGenerate}>
          <ListPlus aria-hidden="true" /> Gerar de receitas
        </button>
      </header>

      <form className="shopping-quick-add" onSubmit={addManual}>
        <label className="field-stack shopping-quick-add__name">
          <span>Adicionar item</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Leite" />
        </label>
        <label className="field-stack">
          <span>Quantidade</span>
          <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="2" />
        </label>
        <label className="field-stack">
          <span>Unidade</span>
          <input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="L" />
        </label>
        <button type="submit" className="button button--quiet" disabled={!name.trim() || busyId === 'new'}>Adicionar</button>
      </form>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      {items.length === 0 ? (
        <div className="shopping-detail__empty">
          <h3>Lista vazia</h3>
          <p>Adicione um item rápido ou gere a compra a partir das receitas e do planejamento.</p>
        </div>
      ) : (
        <div className="shopping-items" aria-label={`Itens de ${list.name}`}>
          {items.map((item) => {
            const editing = editingId === item.id
            return (
              <article className="shopping-item" key={item.id} data-purchased={item.purchased || undefined}>
                <label className="shopping-item__check">
                  <input
                    type="checkbox"
                    checked={item.purchased}
                    disabled={busyId === item.id}
                    onChange={() => void toggle(item)}
                  />
                  <span className="sr-only">{item.purchased ? 'Desmarcar' : 'Marcar'} {item.name}</span>
                </label>

                <div className="shopping-item__content">
                  <strong>{item.name}</strong>
                  {editing ? (
                    <div className="shopping-item__edit">
                      <label>
                        <span className="sr-only">Quantidade de {item.name}</span>
                        <input value={editAmount} onChange={(event) => setEditAmount(event.target.value)} placeholder="Quantidade" />
                      </label>
                      <label>
                        <span className="sr-only">Unidade de {item.name}</span>
                        <input value={editUnit} onChange={(event) => setEditUnit(event.target.value)} placeholder="Unidade" />
                      </label>
                      <button type="button" className="button button--quiet" onClick={() => void saveEdit(item)} disabled={busyId === item.id}>Salvar</button>
                      <button type="button" className="button button--quiet" onClick={() => setEditingId(null)}>Cancelar</button>
                    </div>
                  ) : (
                    <span className="shopping-item__amount">
                      {[formatAmount(item.amount), item.unit].filter(Boolean).join(' ') || 'Sem quantidade'}
                    </span>
                  )}
                  {item.sources.some((source) => source.kind !== 'manual') ? (
                    <details className="shopping-item__sources">
                      <summary>{item.sources.length === 1 ? 'Origem' : `${item.sources.length} origens`}</summary>
                      <ul>{item.sources.map((source, index) => <li key={`${source.kind}-${index}`}>{sourceLabel(source)}</li>)}</ul>
                    </details>
                  ) : null}
                </div>

                {!editing ? (
                  <div className="shopping-item__actions">
                    <button type="button" className="icon-button" onClick={() => beginEdit(item)} aria-label={`Editar ${item.name}`}>
                      <Pencil aria-hidden="true" />
                    </button>
                    <button type="button" className="icon-button shopping-item__delete" onClick={() => void remove(item)} aria-label={`Remover ${item.name}`} disabled={busyId === item.id}>
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
