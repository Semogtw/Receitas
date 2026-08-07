export type AuthSessionStatus =
  | 'loading'
  | 'signed_out'
  | 'needs_email_verification'
  | 'needs_setup'
  | 'ready'

export interface AuthSessionState {
  status: AuthSessionStatus
  userId: string | null
  email: string | null
  pairId: string | null
  restoredFromLocalScope: boolean
}

export const initialAuthSessionState: AuthSessionState = {
  status: 'loading',
  userId: null,
  email: null,
  pairId: null,
  restoredFromLocalScope: false,
}
