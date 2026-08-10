import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useMediaUploadSync } from './use-media-upload-sync'

function Harness({ runtime }: { runtime: { drainUploads(): Promise<unknown> } | null }) {
  useMediaUploadSync(runtime as never)
  return null
}

describe('useMediaUploadSync', () => {
  it('drains on mount when the browser is online and again on online events', async () => {
    const drainUploads = vi.fn(async () => ({ uploadedCount: 0, stoppedOnFailure: false }))
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
    render(<Harness runtime={{ drainUploads }} />)

    await act(async () => { await Promise.resolve() })
    expect(drainUploads).toHaveBeenCalledTimes(1)

    await act(async () => { window.dispatchEvent(new Event('online')); await Promise.resolve() })
    expect(drainUploads).toHaveBeenCalledTimes(2)
  })

  it('does not attempt the initial drain while offline', async () => {
    const drainUploads = vi.fn(async () => ({ uploadedCount: 0, stoppedOnFailure: false }))
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false })
    render(<Harness runtime={{ drainUploads }} />)

    await act(async () => { await Promise.resolve() })
    expect(drainUploads).not.toHaveBeenCalled()
  })

  it('is safe to mount without a runtime during auth transitions', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
    render(<Harness runtime={null} />)

    await act(async () => { window.dispatchEvent(new Event('online')); await Promise.resolve() })
    expect(true).toBe(true)
  })
})
