export type LogoutLocalStateResult = 'safe' | 'pending_data_preserved'

export interface LocalStateReadDatabase {
  get<T>(sql: string): Promise<T>
}

interface CountRow {
  count: number | string | null
}

async function count(database: LocalStateReadDatabase, sql: string): Promise<number> {
  const row = await database.get<CountRow>(sql)
  return Number(row?.count ?? 0)
}

export async function prepareLocalStateForLogout(
  database: LocalStateReadDatabase,
): Promise<LogoutLocalStateResult> {
  const [pendingMutations, protectedMedia] = await Promise.all([
    count(database, 'SELECT count(*) AS count FROM mutation_outbox'),
    count(
      database,
      `SELECT (
        (SELECT count(*) FROM recipe_photos
          WHERE storage_state IN ('local_only', 'upload_pending', 'uploading', 'failed')) +
        (SELECT count(*) FROM cooking_session_photos
          WHERE storage_state IN ('local_only', 'upload_pending', 'uploading', 'failed'))
      ) AS count`,
    ),
  ])

  return pendingMutations > 0 || protectedMedia > 0 ? 'pending_data_preserved' : 'safe'
}
