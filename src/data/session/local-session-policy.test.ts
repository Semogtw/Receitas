import { describe, expect, it } from 'vitest'
import { prepareLocalStateForLogout, type LocalStateReadDatabase } from './local-session-policy'

class RecordingDatabase implements LocalStateReadDatabase {
  readonly statements: string[] = []

  constructor(
    private readonly pendingMutations: number,
    private readonly protectedMedia: number,
  ) {}

  async get<T>(sql: string): Promise<T> {
    this.statements.push(sql)

    if (sql.includes('mutation_outbox')) {
      return { count: this.pendingMutations } as T
    }

    if (sql.includes('recipe_photos')) {
      return { count: this.protectedMedia } as T
    }

    throw new Error(`Unexpected query: ${sql}`)
  }
}

describe('prepareLocalStateForLogout', () => {
  it('reports safe when there is no local state that only this device can recover', async () => {
    const database = new RecordingDatabase(0, 0)

    await expect(prepareLocalStateForLogout(database)).resolves.toBe('safe')
    expect(database.statements).toHaveLength(2)
    expect(database.statements.every((sql) => sql.trimStart().toUpperCase().startsWith('SELECT'))).toBe(true)
  })

  it('preserves pending semantic mutations instead of treating logout as a cleanup boundary', async () => {
    const database = new RecordingDatabase(2, 0)

    await expect(prepareLocalStateForLogout(database)).resolves.toBe('pending_data_preserved')
  })

  it('protects media whose remote copy is not confirmed yet even when the mutation outbox is empty', async () => {
    const database = new RecordingDatabase(0, 1)

    await expect(prepareLocalStateForLogout(database)).resolves.toBe('pending_data_preserved')
    expect(database.statements.some((sql) => sql.includes("storage_state IN ('local_only', 'upload_pending', 'uploading', 'failed')"))).toBe(true)
  })
})
