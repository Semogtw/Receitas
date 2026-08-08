import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../features/auth/AuthProvider', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({
    status: 'ready',
    userId: '10000000-0000-4000-8000-000000000001',
    email: 'a@example.test',
    pairId: '20000000-0000-4000-8000-000000000002',
    restoredFromLocalScope: false,
    signIn: vi.fn(), signOut: vi.fn(), requestPasswordReset: vi.fn(), refreshAuth: vi.fn(),
  }),
}))
vi.mock('../data/PowerSyncProvider', () => ({
  PowerSyncProvider: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('../data/sync/SyncRuntimeProvider', () => ({
  SyncRuntimeProvider: ({ children }: { children: ReactNode }) => children,
  useSyncRuntime: () => ({
    connected: true,
    connecting: false,
    uploading: false,
    downloading: false,
    pendingCount: 0,
    openConflictCount: 0,
    hasError: false,
    lastSyncedAt: null,
    uiState: 'synced',
    label: 'Sincronizado',
    refresh: vi.fn(),
  }),
}))
vi.mock('./PwaLifecycle', () => ({ PwaLifecycle: () => null }))

import { App } from './App'

describe('App', () => {
  it('renders the recipes route for a ready authorized member', async () => {
    window.history.replaceState({}, '', '/recipes')
    render(<App />)
    expect(await screen.findByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Receitas' })).toBeInTheDocument()
  })
})
