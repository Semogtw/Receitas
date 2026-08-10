export type LogoutLocalStateResult = 'safe' | 'pending_data_preserved'

export interface LocalStateReadDatabase {
  get<T>(sql: string, parameters?: unknown[]): Promise<T>
  getOptional<T>(sql: string, parameters?: unknown[]): Promise<T | null>
}

interface CountRow {
  count: number | string | null
}

interface PreferenceRow {
  value_json: string
}

async function count(database: LocalStateReadDatabase, sql: string): Promise<number> {
  const row = await database.get<CountRow>(sql)
  return Number(row?.count ?? 0)
}

function protectedMediaQueueCount(value: string): number {
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return 1
    return parsed.length
  } catch {
    // A malformed queue must never be interpreted as safe-to-discard local data.
    return 1
  }
}

export async function prepareLocalStateForLogout(
  database: LocalStateReadDatabase,
): Promise<LogoutLocalStateResult> {
  const [pendingMutations, mediaQueue] = await Promise.all([
    count(database, 'SELECT count(*) AS count FROM mutation_outbox'),
    database.getOptional<PreferenceRow>(
      'SELECT value_json FROM device_preferences WHERE id = ? LIMIT 1',
      ['media_upload_queue_v1'],
    ),
  ])

  const protectedMedia = mediaQueue ? protectedMediaQueueCount(mediaQueue.value_json) : 0
  return pendingMutations > 0 || protectedMedia > 0 ? 'pending_data_preserved' : 'safe'
}
