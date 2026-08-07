import { describe, expect, it } from 'vitest'
import { AppSchema, SYNCABLE_ENTITY_TYPES } from './schema'

describe('AppSchema', () => {
  it('validates and contains every semantic upload entity exactly once', () => {
    expect(() => AppSchema.validate()).not.toThrow()
    const syncedNames = AppSchema.tables.filter((table) => !table.localOnly).map((table) => table.name)
    for (const entityType of SYNCABLE_ENTITY_TYPES) {
      expect(syncedNames.filter((name) => name === entityType)).toHaveLength(1)
    }
    expect(SYNCABLE_ENTITY_TYPES).toHaveLength(15)
  })

  it('keeps mutation intent and device preferences local-only', () => {
    const localOnly = AppSchema.tables.filter((table) => table.localOnly).map((table) => table.name).sort()
    expect(localOnly).toEqual(['device_preferences', 'mutation_outbox'])
  })

  it('keeps conflict records synced down but outside generic semantic entity writes', () => {
    expect(AppSchema.tables.find((table) => table.name === 'conflicts')?.localOnly).toBe(false)
    expect(SYNCABLE_ENTITY_TYPES).not.toContain('conflicts')
  })
})
