import type { PowerSyncDatabase } from '@powersync/web'

interface RecipeHistoryRow {
  recipe_id: string
}

export async function listCookedRecipeIds(
  database: PowerSyncDatabase,
  pairId: string,
): Promise<Set<string>> {
  const rows = await database.getAll<RecipeHistoryRow>(
    `SELECT recipe_id
       FROM cooking_sessions
      WHERE pair_id = ?
        AND deleted_at IS NULL
      GROUP BY recipe_id`,
    [pairId],
  )

  return new Set(rows.map((row) => row.recipe_id))
}
