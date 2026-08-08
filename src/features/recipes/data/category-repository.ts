import type { PowerSyncDatabase } from '@powersync/web'
import { createMutationEnvelope, type JsonObject, type MutationEnvelope } from '../../../data/mutations/types'
import { performLocalMutation } from '../../../data/mutations/performLocalMutation'
import { resolveMutationBase } from '../../../data/mutations/resolveMutationBase'
import type { RecipeRepositoryScope } from './recipe-repository'

export interface RecipeCategory {
  id: string
  name: string
}

interface DatabaseRow extends Record<string, unknown> { id: string }
type MutationWriter = (database: PowerSyncDatabase, envelope: MutationEnvelope) => Promise<string>

function payloadFromRow(row: DatabaseRow): JsonObject {
  const payload: JsonObject = {}
  for (const [key, value] of Object.entries(row)) {
    if (key === 'id') continue
    if (value === undefined) continue
    payload[key] = value as JsonObject[string]
  }
  return payload
}

function categoryName(value: string): string {
  const name = value.trim()
  if (!name) throw new Error('Category name is required')
  if (name.length > 80) throw new Error('Category name must be at most 80 characters')
  return name
}

export class CategoryRepository {
  constructor(
    private readonly database: PowerSyncDatabase,
    private readonly scope: RecipeRepositoryScope,
    private readonly writeMutation: MutationWriter = performLocalMutation,
  ) {}

  async listCategories(): Promise<RecipeCategory[]> {
    const rows = await this.database.getAll<DatabaseRow>(
      'SELECT id, name FROM categories WHERE pair_id = ? AND deleted_at IS NULL ORDER BY name COLLATE NOCASE ASC',
      [this.scope.pairId],
    )
    return rows.map((row) => ({ id: row.id, name: String(row.name) }))
  }

  async listRecipeCategoryIds(recipeId: string): Promise<string[]> {
    const rows = await this.database.getAll<DatabaseRow>(
      'SELECT id, category_id FROM recipe_categories WHERE recipe_id = ? AND pair_id = ? AND deleted_at IS NULL ORDER BY created_at ASC',
      [recipeId, this.scope.pairId],
    )
    return rows
      .map((row) => row.category_id)
      .filter((categoryId): categoryId is string => typeof categoryId === 'string')
  }

  async createCategory(id: string, rawName: string): Promise<string> {
    const now = new Date().toISOString()
    await this.writeMutation(this.database, createMutationEnvelope({
      pairId: this.scope.pairId,
      actorUserId: this.scope.actorUserId,
      entityType: 'categories',
      entityId: id,
      operation: 'create',
      baseRevision: null,
      base: null,
      next: {
        pair_id: this.scope.pairId,
        revision: 0,
        name: categoryName(rawName),
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
    }))
    return id
  }

  async renameCategory(id: string, rawName: string): Promise<void> {
    const row = await this.database.getOptional<DatabaseRow>(
      'SELECT * FROM categories WHERE id = ? AND pair_id = ? AND deleted_at IS NULL LIMIT 1',
      [id, this.scope.pairId],
    )
    if (!row) throw new Error('Category not found')
    const current = payloadFromRow(row)
    const base = await resolveMutationBase(this.database, 'categories', id, current)

    await this.writeMutation(this.database, createMutationEnvelope({
      pairId: this.scope.pairId,
      actorUserId: this.scope.actorUserId,
      entityType: 'categories',
      entityId: id,
      operation: 'update',
      ...base,
      next: { ...current, name: categoryName(rawName), updated_at: new Date().toISOString() },
    }))
  }

  async assignCategory(id: string, recipeId: string, categoryId: string): Promise<string> {
    const now = new Date().toISOString()
    await this.writeMutation(this.database, createMutationEnvelope({
      pairId: this.scope.pairId,
      actorUserId: this.scope.actorUserId,
      entityType: 'recipe_categories',
      entityId: id,
      operation: 'create',
      baseRevision: null,
      base: null,
      next: {
        pair_id: this.scope.pairId,
        revision: 0,
        recipe_id: recipeId,
        category_id: categoryId,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
    }))
    return id
  }

  async unassignCategory(id: string): Promise<void> {
    const row = await this.database.getOptional<DatabaseRow>(
      'SELECT * FROM recipe_categories WHERE id = ? AND pair_id = ? AND deleted_at IS NULL LIMIT 1',
      [id, this.scope.pairId],
    )
    if (!row) return
    await this.softDeleteLink(row, new Date().toISOString())
  }

  async setRecipeCategories(recipeId: string, selectedCategoryIds: readonly string[]): Promise<void> {
    const selected = new Set(selectedCategoryIds)
    if (selected.size !== selectedCategoryIds.length) {
      throw new Error('Recipe category selection contains duplicate ids')
    }

    const links = await this.database.getAll<DatabaseRow>(
      'SELECT * FROM recipe_categories WHERE recipe_id = ? AND pair_id = ? ORDER BY updated_at DESC',
      [recipeId, this.scope.pairId],
    )
    const now = new Date().toISOString()
    const latestByCategory = new Map<string, DatabaseRow>()

    for (const link of links) {
      const categoryId = typeof link.category_id === 'string' ? link.category_id : null
      if (categoryId && !latestByCategory.has(categoryId)) latestByCategory.set(categoryId, link)
    }

    for (const [categoryId, link] of latestByCategory) {
      const isActive = link.deleted_at === null || link.deleted_at === undefined
      if (isActive && !selected.has(categoryId)) {
        await this.softDeleteLink(link, now)
      }
    }

    for (const categoryId of selected) {
      const existing = latestByCategory.get(categoryId)
      if (!existing) {
        await this.assignCategory(crypto.randomUUID(), recipeId, categoryId)
        continue
      }
      if (existing.deleted_at === null || existing.deleted_at === undefined) continue
      await this.restoreLink(existing, now)
    }
  }

  async softDeleteCategory(id: string): Promise<void> {
    const row = await this.database.getOptional<DatabaseRow>(
      'SELECT * FROM categories WHERE id = ? AND pair_id = ? AND deleted_at IS NULL LIMIT 1',
      [id, this.scope.pairId],
    )
    if (!row) throw new Error('Category not found')

    const now = new Date().toISOString()
    const links = await this.database.getAll<DatabaseRow>(
      'SELECT * FROM recipe_categories WHERE category_id = ? AND pair_id = ? AND deleted_at IS NULL',
      [id, this.scope.pairId],
    )
    for (const link of links) await this.softDeleteLink(link, now)

    const current = payloadFromRow(row)
    const base = await resolveMutationBase(this.database, 'categories', id, current)
    await this.writeMutation(this.database, createMutationEnvelope({
      pairId: this.scope.pairId,
      actorUserId: this.scope.actorUserId,
      entityType: 'categories',
      entityId: id,
      operation: 'soft_delete',
      ...base,
      next: { ...current, deleted_at: now, updated_at: now },
    }))
  }

  private async restoreLink(row: DatabaseRow, now: string): Promise<void> {
    const current = payloadFromRow(row)
    const base = await resolveMutationBase(this.database, 'recipe_categories', row.id, current)
    await this.writeMutation(this.database, createMutationEnvelope({
      pairId: this.scope.pairId,
      actorUserId: this.scope.actorUserId,
      entityType: 'recipe_categories',
      entityId: row.id,
      operation: 'update',
      ...base,
      next: { ...current, deleted_at: null, updated_at: now },
    }))
  }

  private async softDeleteLink(row: DatabaseRow, now: string): Promise<void> {
    const current = payloadFromRow(row)
    const base = await resolveMutationBase(this.database, 'recipe_categories', row.id, current)
    await this.writeMutation(this.database, createMutationEnvelope({
      pairId: this.scope.pairId,
      actorUserId: this.scope.actorUserId,
      entityType: 'recipe_categories',
      entityId: row.id,
      operation: 'soft_delete',
      ...base,
      next: { ...current, deleted_at: now, updated_at: now },
    }))
  }
}
