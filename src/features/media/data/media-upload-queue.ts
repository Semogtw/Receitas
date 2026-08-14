import type { PowerSyncDatabase } from '@powersync/web'

const MEDIA_UPLOAD_QUEUE_KEY = 'media_upload_queue_v1'

export type MediaUploadOwnerType = 'recipe' | 'cooking_session'
export type MediaUploadState = 'pending' | 'uploading' | 'failed'

export interface MediaUploadJob {
  version: 1
  id: string
  pairId: string
  ownerType: MediaUploadOwnerType
  ownerId: string
  mimeType: 'image/webp' | 'image/jpeg'
  extension: 'webp' | 'jpg'
  width: number
  height: number
  sizeBytes: number
  sha256: string
  position: number
  caption: string | null
  createdAt: string
  state: MediaUploadState
  attempts: number
  lastError: string | null
}

interface PreferenceRow {
  value_json: string
}

function assertNonEmpty(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${label} is required`)
  return trimmed
}

function parseJob(value: unknown): MediaUploadJob {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Persisted media upload job is invalid')
  }
  const job = value as Partial<MediaUploadJob>
  const stateIsValid = job.state === 'pending' || job.state === 'uploading' || job.state === 'failed'
  const ownerIsValid = job.ownerType === 'recipe' || job.ownerType === 'cooking_session'
  const mimeIsValid = job.mimeType === 'image/webp' || job.mimeType === 'image/jpeg'
  const extensionIsValid = job.extension === 'webp' || job.extension === 'jpg'
  if (
    job.version !== 1 ||
    typeof job.id !== 'string' || !job.id.trim() ||
    typeof job.pairId !== 'string' || !job.pairId.trim() ||
    !ownerIsValid ||
    typeof job.ownerId !== 'string' || !job.ownerId.trim() ||
    !mimeIsValid ||
    !extensionIsValid ||
    typeof job.width !== 'number' || !Number.isSafeInteger(job.width) || job.width <= 0 ||
    typeof job.height !== 'number' || !Number.isSafeInteger(job.height) || job.height <= 0 ||
    typeof job.sizeBytes !== 'number' || !Number.isSafeInteger(job.sizeBytes) || job.sizeBytes < 0 ||
    typeof job.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(job.sha256) ||
    typeof job.position !== 'number' || !Number.isSafeInteger(job.position) || job.position < 0 ||
    !(job.caption === null || typeof job.caption === 'string') ||
    typeof job.createdAt !== 'string' || !job.createdAt.trim() ||
    !stateIsValid ||
    typeof job.attempts !== 'number' || !Number.isSafeInteger(job.attempts) || job.attempts < 0 ||
    !(job.lastError === null || typeof job.lastError === 'string')
  ) {
    throw new Error('Persisted media upload job is malformed')
  }
  if (
    (job.mimeType === 'image/webp' && job.extension !== 'webp') ||
    (job.mimeType === 'image/jpeg' && job.extension !== 'jpg')
  ) {
    throw new Error('Persisted media upload MIME type does not match its extension')
  }
  return job as MediaUploadJob
}

function parseQueue(value: string): MediaUploadJob[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('Persisted media upload queue is not valid JSON')
  }
  if (!Array.isArray(parsed)) throw new Error('Persisted media upload queue must be an array')
  const jobs = parsed.map(parseJob)
  const ids = new Set<string>()
  for (const job of jobs) {
    if (ids.has(job.id)) throw new Error(`Persisted media upload queue contains duplicate id ${job.id}`)
    ids.add(job.id)
  }
  return jobs
}

function cloneJob(job: MediaUploadJob): MediaUploadJob {
  return { ...job }
}

export class MediaUploadQueueStore {
  constructor(private readonly database: PowerSyncDatabase) {}

  private async readRaw(): Promise<MediaUploadJob[]> {
    const row = await this.database.getOptional<PreferenceRow>(
      `SELECT value_json FROM device_preferences WHERE id = '${MEDIA_UPLOAD_QUEUE_KEY}' LIMIT 1`,
    )
    if (!row) return []
    return parseQueue(row.value_json)
  }

  private async persist(jobs: readonly MediaUploadJob[]): Promise<void> {
    const now = new Date().toISOString()
    await this.database.execute(
      `INSERT INTO device_preferences (id, value_json, updated_at)
       VALUES ('${MEDIA_UPLOAD_QUEUE_KEY}', ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         value_json = excluded.value_json,
         updated_at = excluded.updated_at`,
      [JSON.stringify(jobs), now],
    )
  }

  async load(): Promise<MediaUploadJob[]> {
    const stored = await this.readRaw()
    let recovered = false
    const jobs = stored.map((job) => {
      if (job.state !== 'uploading') return cloneJob(job)
      recovered = true
      return { ...job, state: 'pending' as const, lastError: null }
    })
    if (recovered) await this.persist(jobs)
    return jobs
  }

  async enqueue(jobInput: MediaUploadJob): Promise<void> {
    const job = parseJob(jobInput)
    assertNonEmpty(job.id, 'Media id')
    const jobs = await this.readRaw()
    if (jobs.some((existing) => existing.id === job.id)) {
      await this.persist(jobs)
      return
    }
    await this.persist([...jobs, cloneJob(job)])
  }

  async markUploading(id: string): Promise<void> {
    const jobs = await this.readRaw()
    const next = jobs.map((job) => job.id === id ? { ...job, state: 'uploading' as const, lastError: null } : job)
    if (!next.some((job) => job.id === id)) throw new Error('Media upload job not found')
    await this.persist(next)
  }

  async markFailed(id: string, error: string): Promise<void> {
    const message = error.trim() || 'Upload failed'
    const jobs = await this.readRaw()
    let found = false
    const next = jobs.map((job) => {
      if (job.id !== id) return job
      found = true
      return {
        ...job,
        state: 'failed' as const,
        attempts: job.attempts + 1,
        lastError: message,
      }
    })
    if (!found) throw new Error('Media upload job not found')
    await this.persist(next)
  }

  async retry(id: string): Promise<void> {
    const jobs = await this.readRaw()
    let found = false
    const next = jobs.map((job) => {
      if (job.id !== id) return job
      found = true
      return { ...job, state: 'pending' as const, lastError: null }
    })
    if (!found) throw new Error('Media upload job not found')
    await this.persist(next)
  }

  async remove(id: string): Promise<void> {
    const jobs = await this.readRaw()
    await this.persist(jobs.filter((job) => job.id !== id))
  }
}
