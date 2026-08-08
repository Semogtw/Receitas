import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from './AppShell'
import { AuthGate } from '../features/auth/AuthGate'
import { BootstrapScreen } from '../features/auth/BootstrapScreen'
import { FinishInviteScreen } from '../features/auth/FinishInviteScreen'
import { LoginScreen } from '../features/auth/LoginScreen'
import { PasswordRecoveryScreen } from '../features/auth/PasswordRecoveryScreen'
import { PendingSetupScreen } from '../features/auth/PendingSetupScreen'
import { UpdatePasswordScreen } from '../features/auth/UpdatePasswordScreen'
import { ConflictCenter } from '../features/conflicts/ConflictCenter'
import { HistoryRoute } from './routes/HistoryRoute'
import { PlannerRoute } from './routes/PlannerRoute'
import { RecipesRoute } from './routes/RecipesRoute'
import { SettingsRoute } from './routes/SettingsRoute'
import { ShoppingRoute } from './routes/ShoppingRoute'

export const router = createBrowserRouter([
  { path: '/login', Component: LoginScreen },
  { path: '/recover', Component: PasswordRecoveryScreen },
  { path: '/setup', Component: BootstrapScreen },
  { path: '/auth/finish-invite', Component: FinishInviteScreen },
  { path: '/auth/update-password', Component: UpdatePasswordScreen },
  { path: '/auth/pending', Component: PendingSetupScreen },
  {
    path: '/',
    element: <AuthGate><AppShell /></AuthGate>,
    children: [
      { index: true, element: <Navigate to="/recipes" replace /> },
      { path: 'recipes', Component: RecipesRoute },
      { path: 'planner', Component: PlannerRoute },
      { path: 'shopping', Component: ShoppingRoute },
      { path: 'history', Component: HistoryRoute },
      { path: 'settings', Component: SettingsRoute },
      { path: 'conflicts', Component: ConflictCenter },
      { path: '*', element: <Navigate to="/recipes" replace /> },
    ],
  },
])
