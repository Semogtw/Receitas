import { describe, expect, it } from 'vitest'
import { deriveSyncUiState, syncStatusCopy, type SyncRuntimeSnapshot } from './sync-state'

const base: SyncRuntimeSnapshot = {
  connected: true,
  connecting: false,
  uploading: false,
  downloading: false,
  pendingCount: 0,
  openConflictCount: 0,
  hasError: false,
  lastSyncedAt: null,
}

describe('deriveSyncUiState', () => {
  it('keeps normal synchronized state quiet when no action is required', () => {
    expect(deriveSyncUiState(base)).toBe('synced')
  })

  it('shows pending local work without treating offline as an error', () => {
    expect(deriveSyncUiState({ ...base, connected: false, pendingCount: 2 })).toBe('pending')
    expect(syncStatusCopy('pending', 2)).toBe('2 alterações aguardando')
  })

  it('prioritizes active transfer over generic pending state', () => {
    expect(deriveSyncUiState({ ...base, pendingCount: 3, uploading: true })).toBe('syncing')
  })

  it('prioritizes errors over transfer state', () => {
    expect(deriveSyncUiState({ ...base, uploading: true, hasError: true })).toBe('error')
  })

  it('prioritizes unresolved conflicts over every other status', () => {
    expect(deriveSyncUiState({ ...base, openConflictCount: 1, hasError: true, uploading: true })).toBe('conflict')
  })
})
