import { RouterProvider } from 'react-router/dom'
import { AuthProvider } from '../features/auth/AuthProvider'
import { PowerSyncProvider } from '../data/PowerSyncProvider'
import { SyncRuntimeProvider } from '../data/sync/SyncRuntimeProvider'
import { PwaLifecycle } from './PwaLifecycle'
import { router } from './router'

export function App() {
  return (
    <AuthProvider>
      <PowerSyncProvider>
        <SyncRuntimeProvider>
          <RouterProvider router={router} />
          <PwaLifecycle />
        </SyncRuntimeProvider>
      </PowerSyncProvider>
    </AuthProvider>
  )
}
