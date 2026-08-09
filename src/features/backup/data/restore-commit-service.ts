export interface RestoreMergeCommitResult {
  insertedCount: number
  noopCount: number
  conflictCount: number
}

export interface RestoreCommitProgress {
  stage: 'media' | 'commit'
  completed: number
  total: number
  detail?: string
}

interface FunctionsClient {
  functions: {
    invoke<T>(name: string, options: { body: Record<string, unknown> }): Promise<{ data: T | null; error: unknown | null }>
  }
}

interface PromotionListResponse {
  media?: unknown
}

interface CommitResponse {
  result?: unknown
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} is invalid`)
  return value as Record<string, unknown>
}

function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error(`${label} is invalid`)
  return value
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is invalid`)
  return value
}

async function invoke<T extends Record<string, unknown>>(
  client: FunctionsClient,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.functions.invoke<T>('backup-restore', { body })
  if (error || !data) throw new Error('Restore commit request failed')
  return data
}

function parsePromotionRows(value: unknown): Array<{ path: string; promoted: boolean }> {
  if (!Array.isArray(value)) throw new Error('Restore media promotion list is invalid')
  return value.map((item) => {
    const row = record(item, 'Restore media promotion')
    if (typeof row.promoted !== 'boolean') throw new Error('Restore media promotion status is invalid')
    return { path: text(row.path, 'Restore media path'), promoted: row.promoted }
  })
}

function parseResult(value: unknown): RestoreMergeCommitResult {
  const row = record(value, 'Restore merge result')
  return {
    insertedCount: integer(row.insertedCount, 'Restore inserted count'),
    noopCount: integer(row.noopCount, 'Restore no-op count'),
    conflictCount: integer(row.conflictCount, 'Restore conflict count'),
  }
}

export class RestoreCommitService {
  constructor(private readonly client: FunctionsClient) {}

  async commitMerge(
    jobId: string,
    onProgress?: (progress: RestoreCommitProgress) => void,
  ): Promise<RestoreMergeCommitResult> {
    const listResponse = await invoke<PromotionListResponse & Record<string, unknown>>(this.client, {
      action: 'list_media_promotion',
      jobId,
    })
    const media = parsePromotionRows(listResponse.media)
    const pending = media.filter((item) => !item.promoted)

    for (const [index, item] of pending.entries()) {
      onProgress?.({ stage: 'media', completed: index, total: pending.length, detail: item.path })
      await invoke(this.client, {
        action: 'promote_media',
        jobId,
        path: item.path,
      })
    }
    onProgress?.({ stage: 'media', completed: pending.length, total: pending.length })

    onProgress?.({ stage: 'commit', completed: 0, total: 1 })
    const response = await invoke<CommitResponse & Record<string, unknown>>(this.client, {
      action: 'commit_merge',
      jobId,
    })
    const result = parseResult(response.result)
    onProgress?.({ stage: 'commit', completed: 1, total: 1 })
    return result
  }
}
