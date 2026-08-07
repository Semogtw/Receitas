import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from './AppShell'
import { HistoryRoute } from './routes/HistoryRoute'
import { PlannerRoute } from './routes/PlannerRoute'
import { RecipesRoute } from './routes/RecipesRoute'
import { SettingsRoute } from './routes/SettingsRoute'
import { ShoppingRoute } from './routes/ShoppingRoute'

export const router = createBrowserRouter([
  {
    path: '/',
    Component: AppShell,
    children: [
      { index: true, element: <Navigate to="/recipes" replace /> },
      { path: 'recipes', Component: RecipesRoute },
      { path: 'planner', Component: PlannerRoute },
      { path: 'shopping', Component: ShoppingRoute },
      { path: 'history', Component: HistoryRoute },
      { path: 'settings', Component: SettingsRoute },
      { path: '*', element: <Navigate to="/recipes" replace /> },
    ],
  },
])
