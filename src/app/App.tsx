import { RouterProvider } from 'react-router/dom'
import { AuthProvider } from '../features/auth/AuthProvider'
import { PowerSyncProvider } from '../data/PowerSyncProvider'
import { PwaLifecycle } from './PwaLifecycle'
import { router } from './router'

export function App() {
  return (
    <AuthProvider>
      <PowerSyncProvider>
        <RouterProvider router={router} />
        <PwaLifecycle />
      </PowerSyncProvider>
    </AuthProvider>
  )
}
