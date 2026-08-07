import { RouterProvider } from 'react-router/dom'
import { AuthProvider } from '../features/auth/AuthProvider'
import { PwaLifecycle } from './PwaLifecycle'
import { router } from './router'

export function App() {
  return <AuthProvider><RouterProvider router={router} /><PwaLifecycle /></AuthProvider>
}
