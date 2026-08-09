import type { PowerSyncDatabase } from '@powersync/web'
import { describe, expect, it, vi } from 'vitest'
import type { MutationEnvelope } from '../../../data/mutations/types'
import { ShoppingRepository } from './shopping-repository'

const scope = {
  pairId: '20000000-0000-4000-8000-000000000002',
  actorUserId: '10000000-0000-4000-8000-000000000001',
}
const listId = '71000000-0000-4000-8000-000000000001'
const defaultListId = '71000000-0000-4000-8000-000000000002'
const itemId = '72000000-0000-4000-8000-000000000001'
const recipeId = '40000000-0000-4000-8000-000000000004'

function listRow(id: string, isDefault = false) {
  return {
    id,
    pair_id: scope.pairId,
    name: id === listId ? 'Mercado' : 'Atacado',
    is_default: isDefault ? 1 : 0,
    completed_at: null,
    revision: 3,
    created_at: '2026-08-08T12:00:00.000Z',
    updated_at: '2026-08-08T12:00:00.000Z',
    deleted_at: null,
  }
}

function itemRow() {
  return {
    id: itemId,
    pair_id: scope.pairId,
    shopping_list_id: listId,
    item_name: 'Farinha',
    normalized_name: 'farinha',
    quantity_numerator: 1,
    quantity_denominator: 2,
    quantity_text: null,
    unit: 'kg',
    checked: 0,
    source_kind: 'recipe',
    source_refs: JSON.stringify([{ kind: 'recipe', recipeId }]),
    position: 0,
    revision: 2,
    created_at: '2026-08-08T12:00:00.000Z',
    updated_at: '2026-08-08T12:00:00.000Z',
    deleted_at: null,
  }
}

function fakeDatabase(options: {
  lists?: Record<string, unknown>[]
  defaultRows?: Record<string, unknown>[]
  item?: Record<string, unknown> | null
  maxPosition?: number | null
} = {}) {
  const lists = options.lists ?? [listRow(listId), listRow(defaultListId, true)]
  return {
    getOptional: vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('mutation_outbox')) return null
      if (sql.includes('MAX(position)')) return { max_position: options.maxPosition ?? null }
      if (sql.includes('shopping_lists')) {
        const id = params?.[0]
        return lists.find((row) => row.id === id) ?? null
      }
      if (sql.includes('shopping_items')) return options.item ?? itemRow()
      return null
    }),
    getAll: vi.fn(async (sql: string) => {
      if (sql.includes('is_default = 1')) return options.defaultRows ?? [listRow(defaultListId, true)]
      if (sql.includes('shopping_lists')) return lists
      return []
    }),
  } as unknown as PowerSyncDatabase
}

function writerInto(envelopes: MutationEnvelope[]) {
  return vi.fn(async (_database: PowerSyncDatabase, envelope: MutationEnvelope) => {
    envelopes.push(envelope)
    return envelope.mutationId
  })
}

describe('ShoppingRepository', () => {
  it('creates multiple named shopping lists without implicitly changing the default', async () => {
    const envelopes: MutationEnvelope[] = []
    const repository = new ShoppingRepository(fakeDatabase(), scope, writerInto(envelopes))

    const id = await repository.createShoppingList('  Feira da semana  ')

    expect(envelopes).toHaveLength(1)
    expect(envelopes[0]).toMatchObject({ entityType: 'shopping_lists', entityId: id, operation: 'create' })
    expect(envelopes[0]?.next).toMatchObject({ name: 'Feira da semana', is_default: 0 })
  })

  it('switches the default by clearing the previous list before marking the target', async () => {
    const envelopes: MutationEnvelope[] = []
    const target = listRow(listId, false)
    const oldDefault = listRow(defaultListId, true)
    const repository = new ShoppingRepository(
      fakeDatabase({ lists: [target, oldDefault], defaultRows: [oldDefault] }),
      scope,
      writerInto(envelopes),
    )

    await repository.setDefaultList(listId)

    expect(envelopes.map((envelope) => [envelope.entityId, envelope.next.is_default])).toEqual([
      [defaultListId, 0],
      [listId, 1],
    ])
    expect(envelopes.every((envelope) => envelope.entityType === 'shopping_lists')).toBe(true)
  })

  it('adds generated items with exact rational amount and source metadata', async () => {
    const envelopes: MutationEnvelope[] = []
    const repository = new ShoppingRepository(fakeDatabase({ maxPosition: 4 }), scope, writerInto(envelopes))

    const id = await repository.addItem(listId, {
      name: 'Farinha',
      normalizedName: 'farinha',
      amount: { kind: 'numeric', value: { numerator: 3, denominator: 2 } },
      unit: 'kg',
      source: { kind: 'recipe', recipeId },
    })

    expect(envelopes[0]).toMatchObject({ entityType: 'shopping_items', entityId: id, operation: 'create' })
    expect(envelopes[0]?.next).toMatchObject({
      shopping_list_id: listId,
      item_name: 'Farinha',
      normalized_name: 'farinha',
      quantity_numerator: 3,
      quantity_denominator: 2,
      quantity_text: null,
      unit: 'kg',
      checked: 0,
      source_kind: 'recipe',
      position: 5,
    })
    expect(JSON.parse(String(envelopes[0]?.next.source_refs))).toEqual([{ kind: 'recipe', recipeId }])
  })

  it('edits and checks an item without replacing its source metadata or identity', async () => {
    const envelopes: MutationEnvelope[] = []
    const row = itemRow()
    const repository = new ShoppingRepository(fakeDatabase({ item: row }), scope, writerInto(envelopes))

    await repository.updateItem(itemId, {
      amount: { kind: 'text', text: '1 pacote grande' },
      unit: null,
    })
    await repository.setPurchased(itemId, true)

    expect(envelopes[0]).toMatchObject({ entityId: itemId, operation: 'update', baseRevision: 2 })
    expect(envelopes[0]?.next).toMatchObject({
      quantity_numerator: null,
      quantity_denominator: null,
      quantity_text: '1 pacote grande',
      unit: null,
      source_kind: 'recipe',
      source_refs: row.source_refs,
    })
    expect(envelopes[1]?.next.checked).toBe(1)
  })

  it('soft deletes only the selected shopping item', async () => {
    const envelopes: MutationEnvelope[] = []
    const repository = new ShoppingRepository(fakeDatabase({ item: itemRow() }), scope, writerInto(envelopes))

    await repository.softDeleteItem(itemId)

    expect(envelopes).toHaveLength(1)
    expect(envelopes[0]).toMatchObject({ entityType: 'shopping_items', entityId: itemId, operation: 'soft_delete' })
    expect(typeof envelopes[0]?.next.deleted_at).toBe('string')
  })

  it('maps local rows back to shopping domain values for offline rendering', async () => {
    const database = fakeDatabase({ lists: [listRow(defaultListId, true)] })
    vi.mocked(database.getAll).mockImplementation(async (sql: string) => {
      if (sql.includes('shopping_items')) return [itemRow()] as never
      return [listRow(defaultListId, true)] as never
    })
    const repository = new ShoppingRepository(database, scope)

    const lists = await repository.listShoppingLists()
    const items = await repository.listItems(listId)

    expect(lists[0]).toMatchObject({ id: defaultListId, isDefault: true })
    expect(items[0]).toMatchObject({
      id: itemId,
      listId,
      purchased: false,
      amount: { kind: 'numeric', value: { numerator: 1, denominator: 2 } },
      source: { kind: 'recipe', recipeId },
    })
  })
})
