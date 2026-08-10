import { Check, Plus, Star, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { ShoppingList } from '../domain/types'

interface ShoppingListsProps {
  lists: readonly ShoppingList[]
  activeListId: string | null
  onSelect: (id: string) => void
  onCreate: (name: string) => Promise<void> | void
  onSetDefault: (id: string) => Promise<void> | void
  onDelete: (id: string) => Promise<void> | void
}

export function ShoppingLists({ lists, activeListId, onSelect, onCreate, onSetDefault, onDelete }: ShoppingListsProps) {
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function createList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!newName.trim()) return
    setBusy(true)
    setError(null)
    try {
      await onCreate(newName)
      setNewName('')
    } catch {
      setError('Não foi possível criar a lista.')
    } finally {
      setBusy(false)
    }
  }

  async function makeDefault(id: string) {
    setBusy(true)
    setError(null)
    try {
      await onSetDefault(id)
    } catch {
      setError('Não foi possível alterar a lista padrão.')
    } finally {
      setBusy(false)
    }
  }

  async function moveToTrash(id: string) {
    setBusy(true)
    setError(null)
    try {
      await onDelete(id)
    } catch {
      setError('Não foi possível mover a lista para a lixeira.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="shopping-lists" aria-labelledby="shopping-lists-title">
      <header>
        <h2 id="shopping-lists-title">Listas</h2>
        <span>{lists.length}</span>
      </header>

      {lists.length > 0 ? (
        <div className="shopping-lists__rail" role="list" aria-label="Listas de compras">
          {lists.map((list) => {
            const active = list.id === activeListId
            return (
              <div className="shopping-list-tab" role="listitem" key={list.id} data-active={active || undefined}>
                <button type="button" className="shopping-list-tab__select" onClick={() => onSelect(list.id)} aria-pressed={active}>
                  <span>{list.name}</span>
                  {list.isDefault ? <small><Star aria-hidden="true" /> Padrão</small> : null}
                </button>
                {!list.isDefault ? (
                  <button
                    type="button"
                    className="shopping-list-tab__default"
                    disabled={busy}
                    onClick={() => void makeDefault(list.id)}
                    aria-label={`Definir ${list.name} como lista padrão`}
                    title="Definir como padrão"
                  >
                    <Star aria-hidden="true" />
                  </button>
                ) : (
                  <span className="shopping-list-tab__current" aria-label="Lista padrão"><Check aria-hidden="true" /></span>
                )}
                <button
                  type="button"
                  className="shopping-list-tab__delete icon-button"
                  disabled={busy}
                  onClick={() => void moveToTrash(list.id)}
                  aria-label={`Mover ${list.name} para a lixeira`}
                  title="Mover para a lixeira"
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
            )
          })}
        </div>
      ) : <p className="shopping-lists__empty">Nenhuma lista criada ainda.</p>}

      <form className="shopping-lists__create" onSubmit={createList}>
        <label className="field-stack">
          <span>Nova lista</span>
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Ex.: Mercado"
            maxLength={120}
          />
        </label>
        <button type="submit" className="button button--quiet" disabled={busy || !newName.trim()}>
          <Plus aria-hidden="true" /> Criar
        </button>
      </form>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
    </section>
  )
}
