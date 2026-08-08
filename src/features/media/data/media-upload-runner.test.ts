import { describe, expect, it, vi } from 'vitest'
import { MediaUploadRunner } from './media-upload-runner'

describe('MediaUploadRunner', () => {
  it('drains uploaded items until the worker reports idle', async () => {
    const processNext = vi.fn()
      .mockResolvedValueOnce({ status: 'uploaded', mediaId: 'a' })
      .mockResolvedValueOnce({ status: 'uploaded', mediaId: 'b' })
      .mockResolvedValueOnce({ status: 'idle' })
    const runner = new MediaUploadRunner(processNext)

    await expect(runner.drain()).resolves.toEqual({ uploadedCount: 2, stoppedOnFailure: false })
    expect(processNext).toHaveBeenCalledTimes(3)
  })

  it('stops after a failed item so it cannot spin on a recoverable failure', async () => {
    const processNext = vi.fn(async () => ({ status: 'failed' as const, mediaId: 'a' }))
    const runner = new MediaUploadRunner(processNext)

    await expect(runner.drain()).resolves.toEqual({ uploadedCount: 0, stoppedOnFailure: true })
    expect(processNext).toHaveBeenCalledTimes(1)
  })

  it('coalesces concurrent drain requests into the same in-flight run', async () => {
    let resolveProcess!: (value: { status: 'idle' }) => void
    const processNext = vi.fn(() => new Promise<{ status: 'idle' }>((resolve) => { resolveProcess = resolve }))
    const runner = new MediaUploadRunner(processNext)

    const first = runner.drain()
    const second = runner.drain()
    expect(first).toBe(second)
    expect(processNext).toHaveBeenCalledTimes(1)

    resolveProcess({ status: 'idle' })
    await first
  })
})
