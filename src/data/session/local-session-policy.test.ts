import { describe, expect, it } from 'vitest'
import { prepareLocalStateForLogout, type LocalStateReadDatabase } from './local-session-policy'

class RecordingDatabase implements LocalStateReadDatabase {
  readonly statements: string[] = []

  constructor(
    private readonly pendingMutations: number,
    private readonly mediaQueueJson: string | null,
  ) {}

  async get<T>(sql: string): Promise<T> {
    this.statements.push(sql)
    if (sql.includes('mutation_outbox')) return { count: this.pendingMutations } as T
    throw new Error(`Unexpected query: ${sql}`)
  }

  async getOptional<T>(sql: string, parameters?: readonly unknown[]): Promise<T | null> {
    this.statements.push(`${sql} :: ${JSON.stringify(parameters ?? [])}`)
    if (!sql.includes('device_preferences')) throw new Error(`Unexpected query: ${sql}`)
    return this.mediaQueueJson === null ? null : { value_json: this.mediaQueueJson } as T
  }
}

describe('prepareLocalStateForLogout', () => {
  it('reports safe when there is no local state that only this device can recover', async () => {
    const database = new RecordingDatabase(0, null)

    await expect(prepareLocalStateForLogout(database)).resolves.toBe('safe')
    expect(database.statements).toHaveLength(2)
    expect(database.statements.every((entry) => entry.trimStart().toUpperCase().startsWith('SELECT'))).toBe(true)
  })

  it('preserves pending semantic mutations instead of treating logout as a cleanup boundary', async () => {
    const database = new RecordingDatabase(2, null)

    await expect(prepareLocalStateForLogout(database)).resolves.toBe('pending_data_preserved')
  })

  it('protects the durable media upload queue even when the mutation outbox is empty', async () => {
    const database = new RecordingDatabase(0, JSON.stringify([
      { id: 'photo-a', pairId: 'pair-a', state: 'pending' },
    ]))

    await expect(prepareLocalStateForLogout(database)).resolves.toBe('pending_data_preserved')
    expect(database.statements.some((entry) => entry.includes('media_upload_queue_v1'))).toBe(true)
  })

  it('treats a malformed persisted media queue as protected local data', async () => {
    const database = new RecordingDatabase(0, '{broken')

    await expect(prepareLocalStateForLogout(database)).resolves.toBe('pending_data_preserved')
  })

  it('treats an empty persisted media queue as safe when there are no semantic mutations', async () => {
    const database = new RecordingDatabase(0, '[]')

    await expect(prepareLocalStateForLogout(database)).resolves.toBe('safe')
  })
})
