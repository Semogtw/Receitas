import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getCachedDatabase } from '../../data/database'
import { prepareLocalStateForLogout } from '../../data/session/local-session-policy'
import { getSupabaseClient } from '../../lib/supabase/client'
import {
  clearCachedAuthScope,
  readCachedAuthScope,
  writeCachedAuthScope,
} from './auth-scope-cache'
import { initialAuthSessionState, type AuthSessionState } from './auth-state'

interface AuthActions {
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
  requestPasswordReset(email: string): Promise<void>
  refreshAuth(): Promise<void>
}

type AuthContextValue = AuthSessionState & AuthActions

const AuthContext = createContext<AuthContextValue | null>(null)

async function resolveSession(session: Session | null): Promise<AuthSessionState> {
  if (!session) return { ...initialAuthSessionState, status: 'signed_out' }

  const user = session.user
  if (!user.email_confirmed_at) {
    clearCachedAuthScope(user.id)
    return {
      status: 'needs_email_verification',
      userId: user.id,
      email: user.email ?? null,
      pairId: null,
      restoredFromLocalScope: false,
    }
  }

  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('pair_members')
    .select('pair_id')
    .eq('user_id', user.id)
    .not('activated_at', 'is', null)
    .is('removed_at', null)
    .maybeSingle()

  if (!error && data?.pair_id) {
    const pairId = data.pair_id as string
    writeCachedAuthScope(user.id, pairId)
    return {
      status: 'ready',
      userId: user.id,
      email: user.email ?? null,
      pairId,
      restoredFromLocalScope: false,
    }
  }

  if (error) {
    const cached = readCachedAuthScope(user.id)
    if (cached) {
      return {
        status: 'ready',
        userId: user.id,
        email: user.email ?? null,
        pairId: cached.pairId,
        restoredFromLocalScope: true,
      }
    }
  } else {
    clearCachedAuthScope(user.id)
  }

  return {
    status: 'needs_setup',
    userId: user.id,
    email: user.email ?? null,
    pairId: null,
    restoredFromLocalScope: false,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthSessionState>(initialAuthSessionState)

  const refreshAuth = useCallback(async () => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      const userId = state.userId
      if (userId) {
        const cached = readCachedAuthScope(userId)
        if (cached) {
          setState((current) => ({ ...current, status: 'ready', pairId: cached.pairId, restoredFromLocalScope: true }))
          return
        }
      }
      setState({ ...initialAuthSessionState, status: 'signed_out' })
      return
    }

    setState(await resolveSession(data.session))
  }, [state.userId])

  useEffect(() => {
    void refreshAuth()
    const supabase = getSupabaseClient()
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setState({ ...initialAuthSessionState, status: 'signed_out' })
        return
      }
      window.setTimeout(() => void refreshAuth(), 0)
    })

    return () => subscription.subscription.unsubscribe()
  }, [refreshAuth])

  const actions = useMemo<AuthActions>(() => ({
    signIn: async (email, password) => {
      const supabase = getSupabaseClient()
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error
      await refreshAuth()
    },
    signOut: async () => {
      const currentUserId = state.userId
      const currentPairId = state.pairId

      if (currentUserId && currentPairId) {
        const database = getCachedDatabase({ userId: currentUserId, pairId: currentPairId })
        if (database) {
          try {
            await prepareLocalStateForLogout(database)
          } catch {
            // Logout must remain available. The safe fallback is to leave local state untouched.
          }
        }
      }

      const supabase = getSupabaseClient()
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw error
      if (currentUserId) clearCachedAuthScope(currentUserId)
      setState({ ...initialAuthSessionState, status: 'signed_out' })
    },
    requestPasswordReset: async (email) => {
      const supabase = getSupabaseClient()
      const redirectTo = new URL('/auth/update-password', window.location.origin).toString()
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
      if (error) throw error
    },
    refreshAuth,
  }), [refreshAuth, state.userId, state.pairId])

  return <AuthContext.Provider value={{ ...state, ...actions }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
