import { useEffect } from 'react'
import type { MediaRuntime } from './media-runtime'

type UploadRuntime = Pick<MediaRuntime, 'drainUploads'>

export function useMediaUploadSync(runtime: UploadRuntime | null): void {
  useEffect(() => {
    if (!runtime) return

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
