import { describe, expect, it, vi } from 'vitest'
import { RestoreCommitService } from './restore-commit-service'

function fakeClient() {
  const actions: Array<Record<string, unknown>> = []
  const invoke = vi.fn(async (_name: string, options: { body: Record<string, unknown> }) => {
    actions.push(options.body)
    if (options.body.action === 'list_media_promotion') {
      return {
        data: {
          media: [
            { path: 'media/a.webp', promoted: true },
            { path: 'media/b.webp', promoted: false },
            { path: 'media/c.webp', promoted: false },
          ],
        },
        error: null,
      }
    }
    if (options.body.action === 'commit_merge') {
      return {
        data: {
          result: { insertedCount: 4, noopCount: 2, conflictCount: 1 },
        },
        error: null,
      }
    }
    return { data: { promotion: { ok: true } }, error: null }
  })
  return { client: { functions: { invoke } }, invoke, actions }
}

describe('RestoreCommitService', () => {
  it('promotes only media that has not already completed and commits afterward', async () => {
    const fake = fakeClient()
    const progress: string[] = []
    const service = new RestoreCommitService(fake.client)

    const result = await service.commitMerge('job-1', (item) => {
      progress.push(`${item.stage}:${item.completed}/${item.total}`)
    })

    expect(result).toEqual({ insertedCount: 4, noopCount: 2, conflictCount: 1 })
    expect(fake.actions.map((item) => item.action)).toEqual([
      'list_media_promotion',
      'promote_media',
      'promote_media',
      'commit_merge',
    ])
    expect(fake.actions.filter((item) => item.action === 'promote_media').map((item) => item.path)).toEqual([
      'media/b.webp',
      'media/c.webp',
    ])
    expect(progress).toEqual([
      'media:0/2',
      'media:1/2',
      'media:2/2',
      'commit:0/1',
      'commit:1/1',
    ])
  })

  it('does not call commit when media promotion fails', async () => {
    const fake = fakeClient()
    fake.invoke.mockImplementation(async (_name: string, options: { body: Record<string, unknown> }) => {
      fake.actions.push(options.body)
      if (options.body.action === 'list_media_promotion') {
        return { data: { media: [{ path: 'media/b.webp', promoted: false }] }, error: null }
      }
      if (options.body.action === 'promote_media') {
        return { data: null, error: { message: 'promotion failed' } }
      }
      return { data: { result: {} }, error: null }
    })
    const service = new RestoreCommitService(fake.client)

    await expect(service.commitMerge('job-1')).rejects.toThrow('Restore commit request failed')
    expect(fake.actions.some((item) => item.action === 'commit_merge')).toBe(false)
  })
})
