import { Navigate, useLocation } from 'react-router'
import type { ReactNode } from 'react'
import { useAuth } from './AuthProvider'

export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const location = useLocation()

  if (auth.status === 'loading') {
    return <main className="auth-page"><p role="status">Abrindo seu caderno…</p></main>
  }

  if (auth.status === 'signed_out') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (auth.status === 'needs_email_verification' || auth.status === 'needs_setup') {
    return <Navigate to="/auth/pending" replace />
  }

  return children
}
