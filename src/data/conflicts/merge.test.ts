import { describe, expect, it } from 'vitest'
import { buildMergedResolution, conflictFields } from './merge'

describe('conflictFields', () => {
  it('returns only fields where local and remote disagree and ignores transport metadata', () => {
    const base = { pair_id: 'pair', revision: 2, title: 'Bolo', favorite: 0, note: 'base' }
    const local = { pair_id: 'pair', revision: 2, title: 'Bolo local', favorite: 0, note: 'base' }
    const remote = { pair_id: 'pair', revision: 3, title: 'Bolo remoto', favorite: 1, note: 'base' }

    expect(conflictFields(base, local, remote)).toEqual([
      expect.objectContaining({ field: 'favorite', localChanged: false, remoteChanged: true }),
      expect.objectContaining({ field: 'title', localChanged: true, remoteChanged: true }),
    ])
  })
})

describe('buildMergedResolution', () => {
  it('starts from the stable remote row and applies only explicitly selected local fields', () => {
    const local = {
      id: 'recipe-1',
      pair_id: 'pair-1',
      revision: 2,
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-02T00:00:00.000Z',
      title: 'Título local',
      favorite: 0,
    }
    const remote = {
      id: 'recipe-1',
      pair_id: 'pair-1',
      revision: 4,
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-07T00:00:00.000Z',
      title: 'Título remoto',
      favorite: 1,
    }

    const merged = buildMergedResolution(remote, local, { title: 'local', favorite: 'remote', revision: 'local' })

    expect(merged.title).toBe('Título local')
    expect(merged.favorite).toBe(1)
    expect(merged.revision).toBe(4)
    expect(merged.updated_at).toBe('2026-08-07T00:00:00.000Z')
  })
})
