import {
  cleanupCommittedRestoreMedia,
  cleanupRestoreJobs,
  cleanupUnreferencedPromotedMedia,
} from './cleanup.ts'

function assert(condition: unknown, message = 'Assertion failed'): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEquals(actual: unknown, expected: unknown, message = 'Values differ'): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

async function assertRejects(action: () => Promise<unknown>, contains: string): Promise<void> {
  try {
    await action()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    assert(message.includes(contains), `Expected ${contains}, got ${message}`)
    return
  }
  throw new Error(`Expected rejection containing ${contains}`)
}

function fakeAdmin(options: {
  referencedPaths?: string[]
  candidateRows?: unknown[]
  promotionRows?: unknown[]
  failStagedRemove?: boolean
} = {}) {
  const referenced = new Set(options.referencedPaths ?? [])
  const removed: Array<{ bucket: string; paths: string[] }> = []
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []

  const admin = {
    from(table: string) {
      return {
        select() {
          return {
            eq(_column: string, path: string) {
              return {
                async limit() {
                  return {
                    data: referenced.has(path) ? [{ id: `${table}-row` }] : [],
                    error: null,
                  }
                },
              }
            },
          }
        },
      }
    },
    storage: {
      from(bucket: string) {
        return {
          async remove(paths: string[]) {
            removed.push({ bucket, paths })
            if (options.failStagedRemove && bucket === 'restore-staging') {
              return { data: null, error: { message: 'remove failed' } }
            }
            return { data: paths, error: null }
          },
        }
      },
    },
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args })
      if (name === 'read_restore_cleanup_candidates') {
        return { data: options.candidateRows ?? [], error: null }
      }
      if (name === 'read_restore_media_promotion_server') {
        return { data: options.promotionRows ?? [], error: null }
      }
      if (name === 'delete_restore_cleanup_job') return { data: true, error: null }
      return { data: null, error: null }
    },
  }

  return { admin: admin as never, removed, rpcCalls }
}

Deno.test('promoted media cleanup keeps paths referenced by active or soft-deleted photo metadata', async () => {
  const fake = fakeAdmin({ referencedPaths: ['pair/actor/restore/photo-a-sha.webp'] })

  const removed = await cleanupUnreferencedPromotedMedia(fake.admin, [
    'pair/actor/restore/photo-a-sha.webp',
    'pair/actor/restore/photo-b-sha.webp',
  ])

  assertEquals(removed, 1)
  assertEquals(fake.removed, [{
    bucket: 'recipe-media',
    paths: ['pair/actor/restore/photo-b-sha.webp'],
  }])
})

Deno.test('immediate post-commit cleanup removes staging and only orphan promoted media', async () => {
  const fake = fakeAdmin({
    referencedPaths: ['pair/actor/restore/referenced.webp'],
    promotionRows: [
      {
        storage_path: 'pair/job/a.webp',
        promoted_storage_path: 'pair/actor/restore/referenced.webp',
      },
      {
        storage_path: 'pair/job/b.webp',
        promoted_storage_path: 'pair/actor/restore/orphan.webp',
      },
    ],
  })

  await cleanupCommittedRestoreMedia(fake.admin, 'actor', 'pair', 'job')

  assertEquals(fake.removed, [
    { bucket: 'restore-staging', paths: ['pair/job/a.webp', 'pair/job/b.webp'] },
    { bucket: 'recipe-media', paths: ['pair/actor/restore/orphan.webp'] },
  ])
})

Deno.test('expired job cleanup deletes DB staging only after object cleanup succeeds', async () => {
  const fake = fakeAdmin({
    candidateRows: [{
      id: 'job-1',
      pair_id: 'pair-1',
      status: 'rejected',
      staged_media: [{
        storage_path: 'pair/job/a.webp',
        promoted_storage_path: 'pair/actor/restore/orphan.webp',
      }],
    }],
  })

  const cleaned = await cleanupRestoreJobs(fake.admin, 1)

  assertEquals(cleaned, 1)
  assert(fake.rpcCalls.some((call) => call.name === 'delete_restore_cleanup_job'))
})

Deno.test('Storage cleanup failure preserves DB job metadata for a later retry', async () => {
  const fake = fakeAdmin({
    failStagedRemove: true,
    candidateRows: [{
      id: 'job-1',
      pair_id: 'pair-1',
      status: 'rejected',
      staged_media: [{ storage_path: 'pair/job/a.webp', promoted_storage_path: null }],
    }],
  })

  await assertRejects(() => cleanupRestoreJobs(fake.admin, 1), 'restore_cleanup_staged_remove_failed')
  assert(!fake.rpcCalls.some((call) => call.name === 'delete_restore_cleanup_job'))
})
