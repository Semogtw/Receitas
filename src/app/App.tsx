import { RouterProvider } from 'react-router/dom'
import { PwaLifecycle } from './PwaLifecycle'
import { router } from './router'

export function App() {
  return (
    <>
      <RouterProvider router={router} />
      <PwaLifecycle />
    </>
  )
}
