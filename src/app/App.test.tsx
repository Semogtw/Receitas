import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../features/auth/AuthProvider', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({
    status: 'ready', userId: 'user-a', email: 'a@example.test', pairId: 'pair-a', restoredFromLocalScope: false,
    signIn: vi.fn(), signOut: vi.fn(), requestPasswordReset: vi.fn(), refreshAuth: vi.fn(),
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
