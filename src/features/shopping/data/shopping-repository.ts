import type { PowerSyncDatabase } from '@powersync/web'
import { createMutationEnvelope, type JsonObject, type MutationEnvelope } from '../../../data/mutations/types'
import { performLocalMutation } from '../../../data/mutations/performLocalMutation'
import { resolveMutationBase } from '../../../data/mutations/resolveMutationBase'
import { deserializeIngredientAmount, serializeIngredientAmount } from '../../recipes/domain/amount'
import type {
  ShoppingItem,
  ShoppingItemDraft,
  ShoppingItemPatch,
  ShoppingList,
  ShoppingRepositoryScope,
  ShoppingSource,
} from '../domain/types'

interface DatabaseRow extends Record<string, unknown> { id: string }
type MutationWriter = (database: PowerSyncDatabase, envelope: MutationEnvelope) => Promise<string>

function payloadFromRow(row: DatabaseRow): JsonObject {
  const payload: JsonObject = {}
  for (const [key, value] of Object.entries(row)) {
    if (key === 'id' || value === undefined) continue
    payload[key] = value as JsonObject[string]
  }
  return payload
}

function requiredText(value: string, label: string, maxLength: number): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  if (normalized.length > maxLength) throw new Error(`${label} must be at most ${maxLength} characters`)
  return normalized
}

function normalizeUnit(value: string | null): string | null {
  if (value === null) return null
  const unit = value.trim()
  return unit || null
}

function validateSource(source: ShoppingSource): ShoppingSource {
  if (source.kind === 'recipe' && !source.recipeId) {
    throw new Error('Recipe shopping source requires recipeId')
  }
  if (source.kind === 'planner' && !source.mealPlanEntryId) {
    throw new Error('Planner shopping source requires mealPlanEntryId')
  }
  return source
}

function sourceToJson(source: ShoppingSource): JsonObject {
  validateSource(source)
  const result: JsonObject = { kind: source.kind }
  if (source.recipeId) result.recipeId = source.recipeId
  if (source.mealPlanEntryId) result.mealPlanEntryId = source.mealPlanEntryId
  return result
}

function parseSources(value: unknown): ShoppingSource[] {
  if (typeof value !== 'string') return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
      const source = entry as Record<string, unknown>
      if (source.kind !== 'manual' && source.kind !== 'recipe' && source.kind !== 'planner') return []
      return [{
        kind: source.kind,
        ...(typeof source.recipeId === 'string' ? { recipeId: source.recipeId } : {}),
        ...(typeof source.mealPlanEntryId === 'string' ? { mealPlanEntryId: source.mealPlanEntryId } : {}),
      } satisfies ShoppingSource]
    })
  } catch {
    return []
  }
}

function amountColumns(amount: ShoppingItemDraft['amount']) {
  const serialized = serializeIngredientAmount(amount)
  return {
    quantity_numerator: serialized.quantityNum,
    quantity_denominator: serialized.quantityDen,
    quantity_text: serialized.quantityText,
  }
}

function mapList(row: DatabaseRow): ShoppingList {
  return {
    id: row.id,
    pairId: String(row.pair_id),
    name: String(row.name),
    isDefault: Boolean(row.is_default),
    revision: Number(row.revision),
    deletedAt: typeof row.deleted_at === 'string' ? row.deleted_at : null,
  }
}

function mapItem(row: DatabaseRow): ShoppingItem {
  const sources = parseSources(row.source_refs)
  const source = sources[0] ?? { kind: 'manual' as const }
  return {
    id: row.id,
    listId: String(row.shopping_list_id),
    pairId: String(row.pair_id),
    name: String(row.item_name),
    normalizedName: String(row.normalized_name),
    amount: deserializeIngredientAmount({
      quantityNum: typeof row.quantity_numerator === 'number' ? row.quantity_numerator : null,
      quantityDen: typeof row.quantity_denominator === 'number' ? row.quantity_denominator : null,
      quantityText: typeof row.quantity_text === 'string' ? row.quantity_text : null,
    }),
    unit: typeof row.unit === 'string' ? row.unit : null,
    source,
    purchased: Boolean(row.checked),
    revision: Number(row.revision),
    deletedAt: typeof row.deleted_at === 'string' ? row.deleted_at : null,
  }
}

export class ShoppingRepository {
  constructor(
    private readonly database: PowerSyncDatabase,
    private readonly scope: ShoppingRepositoryScope,
    private readonly writeMutation: MutationWriter = performLocalMutation,
  ) {}

  async listShoppingLists(): Promise<ShoppingList[]> {
    const rows = await this.database.getAll<DatabaseRow>(
      `SELECT * FROM shopping_lists
       WHERE pair_id = ? AND deleted_at IS NULL
       ORDER BY is_default DESC, updated_at DESC, name COLLATE NOCASE ASC`,
      [this.scope.pairId],
    )
    return rows.map(mapList)
  }

  async listItems(listId: string): Promise<ShoppingItem[]> {
    const rows = await this.database.getAll<DatabaseRow>(
      `SELECT * FROM shopping_items
       WHERE pair_id = ? AND shopping_list_id = ? AND deleted_at IS NULL
       ORDER BY checked ASC, position ASC, created_at ASC`,
      [this.scope.pairId, listId],
    )
    return rows.map(mapItem)
  }

  async createShoppingList(rawName: string, makeDefault = false): Promise<string> {
    const name = requiredText(rawName, 'Shopping list name', 120)
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    await this.writeMutation(this.database, createMutationEnvelope({
      pairId: this.scope.pairId,
      actorUserId: this.scope.actorUserId,
      entityType: 'shopping_lists',
      entityId: id,
      operation: 'create',
      baseRevision: null,
      base: null,
      next: {
        pair_id: this.scope.pairId,
        revision: 0,
        name,
        is_default: 0,
        completed_at: null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
    }))

    if (makeDefault) await this.setDefaultList(id)
    return id
  }

  async renameShoppingList(id: string, rawName: string): Promise<void> {
    const row = await this.activeRow('shopping_lists', id)
    await this.updateRow('shopping_lists', row, {
      name: requiredText(rawName, 'Shopping list name', 120),
      updated_at: new Date().toISOString(),
    })
  }

  async setDefaultList(id: string): Promise<void> {
    const target = await this.activeRow('shopping_lists', id)
    const currentDefaults = await this.database.getAll<DatabaseRow>(
      `SELECT * FROM shopping_lists
       WHERE pair_id = ? AND deleted_at IS NULL AND is_default = 1 AND id <> ?`,
      [this.scope.pairId, id],
    )
    const now = new Date().toISOString()

    for (const row of currentDefaults) {
      await this.updateRow('shopping_lists', row, { is_default: 0, updated_at: now })
    }
    if (!Boolean(target.is_default)) {
      await this.updateRow('shopping_lists', target, { is_default: 1, updated_at: now })
    }
  }

  async addItem(listId: string, draft: ShoppingItemDraft): Promise<string> {
    await this.activeRow('shopping_lists', listId)
    const name = requiredText(draft.name, 'Shopping item name', 240)
    const normalizedName = requiredText(draft.normalizedName, 'Normalized shopping item name', 240)
    const source = validateSource(draft.source)
    const positionRow = await this.database.getOptional<{ max_position: number | null }>(
      `SELECT MAX(position) AS max_position FROM shopping_items
       WHERE pair_id = ? AND shopping_list_id = ? AND deleted_at IS NULL`,
      [this.scope.pairId, listId],
    )
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    await this.writeMutation(this.database, createMutationEnvelope({
      pairId: this.scope.pairId,
      actorUserId: this.scope.actorUserId,
      entityType: 'shopping_items',
      entityId: id,
      operation: 'create',
      baseRevision: null,
      base: null,
      next: {
        pair_id: this.scope.pairId,
        revision: 0,
        shopping_list_id: listId,
        item_name: name,
        normalized_name: normalizedName,
        ...amountColumns(draft.amount),
        unit: normalizeUnit(draft.unit),
        checked: 0,
        source_kind: source.kind,
        source_refs: JSON.stringify([sourceToJson(source)]),
        position: (positionRow?.max_position ?? -1) + 1,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
    }))
    return id
  }

  async updateItem(id: string, patch: ShoppingItemPatch): Promise<void> {
    const row = await this.activeRow('shopping_items', id)
    const changes: JsonObject = { updated_at: new Date().toISOString() }

    if (patch.name !== undefined) changes.item_name = requiredText(patch.name, 'Shopping item name', 240)
    if (patch.normalizedName !== undefined) {
      changes.normalized_name = requiredText(patch.normalizedName, 'Normalized shopping item name', 240)
    }
    if (patch.amount !== undefined) Object.assign(changes, amountColumns(patch.amount))
    if (patch.unit !== undefined) changes.unit = normalizeUnit(patch.unit)
    if (patch.purchased !== undefined) changes.checked = patch.purchased ? 1 : 0

    await this.updateRow('shopping_items', row, changes)
  }

  async setPurchased(id: string, purchased: boolean): Promise<void> {
    await this.updateItem(id, { purchased })
  }

  async softDeleteItem(id: string): Promise<void> {
    const row = await this.activeRow('shopping_items', id)
    const current = payloadFromRow(row)
    const base = await resolveMutationBase(this.database, 'shopping_items', id, current)
    const now = new Date().toISOString()
    await this.writeMutation(this.database, createMutationEnvelope({
      pairId: this.scope.pairId,
      actorUserId: this.scope.actorUserId,
      entityType: 'shopping_items',
      entityId: id,
      operation: 'soft_delete',
      ...base,
      next: { ...current, deleted_at: now, updated_at: now },
    }))
  }

  async restoreItem(id: string): Promise<void> {
    const row = await this.database.getOptional<DatabaseRow>(
      'SELECT * FROM shopping_items WHERE id = ? AND pair_id = ? AND deleted_at IS NOT NULL LIMIT 1',
      [id, this.scope.pairId],
    )
    if (!row) throw new Error('Deleted shopping item not found')
    await this.updateRow('shopping_items', row, { deleted_at: null, updated_at: new Date().toISOString() })
  }

  private async updateRow(
    entityType: 'shopping_lists' | 'shopping_items',
    row: DatabaseRow,
    changes: JsonObject,
  ): Promise<void> {
    const current = payloadFromRow(row)
    const base = await resolveMutationBase(this.database, entityType, row.id, current)
    await this.writeMutation(this.database, createMutationEnvelope({
      pairId: this.scope.pairId,
      actorUserId: this.scope.actorUserId,
      entityType,
      entityId: row.id,
      operation: 'update',
      ...base,
      next: { ...current, ...changes },
    }))
  }

  private async activeRow(entityType: 'shopping_lists' | 'shopping_items', id: string): Promise<DatabaseRow> {
    const row = await this.database.getOptional<DatabaseRow>(
      `SELECT * FROM ${entityType} WHERE id = ? AND pair_id = ? AND deleted_at IS NULL LIMIT 1`,
      [id, this.scope.pairId],
    )
    if (!row) throw new Error(entityType === 'shopping_lists' ? 'Shopping list not found' : 'Shopping item not found')
    return row
  }
}
