import { useEffect } from 'react'
import type { MediaRuntime } from './media-runtime'

export function useMediaUploadSync(runtime: MediaRuntime): void {
  useEffect(() => {
    let active = true

    const drain = () => {
      if (!active || !navigator.onLine) return
      void runtime.drainUploads().catch(() => {
        // The persistent queue remains the source of truth. A later online event or explicit retry can resume it.
      })
    }

    drain()
    window.addEventListener('online', drain)
    return () => {
      active = false
      window.removeEventListener('online', drain)
    }
  }, [runtime])
}
