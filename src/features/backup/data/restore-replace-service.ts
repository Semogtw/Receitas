import type { PowerSyncDatabase } from '@powersync/web'
import type { BackupArtifact } from '../domain/complete-backup-format'
import { createCompleteBackup, type CompleteBackupMediaDownloader, type CompleteBackupProgress } from './complete-backup-service'
import { RestoreStagingService, type RestoreJobSummary, type RestoreStagingProgress } from './restore-staging-service'

export interface RestoreReplaceCommitResult {
  insertedCount: number
  updatedCount: number
  replacedCount: number
}

export interface ReplacePreparation {
  replaceJob: RestoreJobSummary
  safetyJob: RestoreJobSummary
  safetyArtifact: BackupArtifact
}

export type ReplaceProgress =
  | { stage: 'safety_backup'; progress: CompleteBackupProgress }
  | { stage: 'safety_staging'; progress: RestoreStagingProgress }
  | { stage: 'promotion'; completed: number; total: number; detail?: string }
  | { stage: 'commit'; completed: number; total: number }

interface RestoreFunctionsClient {
  functions: {
    invoke<T>(name: string, options: { body: Record<string, unknown> }): Promise<{ data: T | null; error: unknown | null }>
  }
  storage: {
    from(bucket: string): {
      uploadToSignedUrl(
        path: string,
        token: string,
        body: Blob,
        options?: { contentType?: string },
      ): Promise<{ data: unknown | null; error: unknown | null }>
    }
  }
}

interface JobResponse {
  job?: unknown
}

interface PromotionListResponse {
  media?: unknown
}

interface ReplaceCommitResponse {
  result?: unknown
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} is invalid`)
  return value as Record<string, unknown>
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is invalid`)
  return value
}

function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error(`${label} is invalid`)
  return value
}

function parseJob(value: unknown): RestoreJobSummary {
  const row = record(value, 'Replace restore job')
  const mode = row.mode
  const status = row.status
  if (mode !== 'merge' && mode !== 'replace_all') throw new Error('Replace restore job mode is invalid')
  if (!['uploading', 'validating', 'ready_to_commit', 'committing', 'completed', 'rejected'].includes(String(status))) {
    throw new Error('Replace restore job status is invalid')
  }
  return {
    id: text(row.id, 'Replace restore job id'),
    pairId: text(row.pairId, 'Replace restore pair id'),
    mode,
    status: status as RestoreJobSummary['status'],
    manifestSha256: text(row.manifestSha256, 'Replace manifest hash'),
    safetyBackupId: row.safetyBackupId === null || row.safetyBackupId === undefined
      ? null
      : text(row.safetyBackupId, 'Replace safety backup id'),
    expiresAt: text(row.expiresAt, 'Replace restore expiry'),
  }
}

async function invoke<T extends Record<string, unknown>>(
  client: RestoreFunctionsClient,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.functions.invoke<T>('backup-restore', { body })
  if (error || !data) throw new Error('Replace restore request failed')
  return data
}

function parsePromotions(value: unknown): Array<{ path: string; promoted: boolean }> {
  if (!Array.isArray(value)) throw new Error('Replace media promotion list is invalid')
  return value.map((item) => {
    const row = record(item, 'Replace media promotion')
    if (typeof row.promoted !== 'boolean') throw new Error('Replace media promotion status is invalid')
    return { path: text(row.path, 'Replace media path'), promoted: row.promoted }
  })
}

function parseReplaceResult(value: unknown): RestoreReplaceCommitResult {
  const row = record(value, 'Replace commit result')
  return {
    insertedCount: integer(row.insertedCount, 'Replace inserted count'),
    updatedCount: integer(row.updatedCount, 'Replace updated count'),
    replacedCount: integer(row.replacedCount, 'Replace previous count'),
  }
}

export class RestoreReplaceService {
  private readonly staging: RestoreStagingService

  constructor(
    private readonly client: RestoreFunctionsClient,
    private readonly database: PowerSyncDatabase,
    private readonly pairId: string,
    private readonly actorUserId: string,
    private readonly appVersion: string,
    private readonly mediaDownloader: CompleteBackupMediaDownloader,
  ) {
    this.staging = new RestoreStagingService(client)
  }

  async stageIncoming(
    archive: Blob,
    onProgress?: (progress: RestoreStagingProgress) => void,
  ): Promise<RestoreJobSummary> {
    const job = await this.staging.stageArchive(archive, 'replace_all', onProgress)
    if (job.mode !== 'replace_all' || job.status !== 'ready_to_commit') {
      throw new Error('Replace staging did not finish ready')
    }
    return job
  }

  async prepareSafety(
    replaceJob: RestoreJobSummary,
    onProgress?: (progress: ReplaceProgress) => void,
  ): Promise<ReplacePreparation> {
    if (replaceJob.mode !== 'replace_all' || replaceJob.status !== 'ready_to_commit') {
      throw new Error('Replace job is not ready for safety backup')
    }

    const safetyArtifact = await createCompleteBackup({
      database: this.database,
      pairId: this.pairId,
      actorUserId: this.actorUserId,
      appVersion: this.appVersion,
      mediaDownloader: this.mediaDownloader,
      onProgress: (progress) => onProgress?.({ stage: 'safety_backup', progress }),
    })

    const safetyJob = await this.staging.stageArchive(
      safetyArtifact.file,
      'merge',
      (progress) => onProgress?.({ stage: 'safety_staging', progress }),
    )
    if (safetyJob.mode !== 'merge' || safetyJob.status !== 'ready_to_commit') {
      throw new Error('Safety backup staging did not finish ready')
    }

    const response = await invoke<JobResponse & Record<string, unknown>>(this.client, {
      action: 'attach_safety_backup',
      replaceJobId: replaceJob.id,
      safetyJobId: safetyJob.id,
    })
    const attached = parseJob(response.job)
    if (attached.id !== replaceJob.id || attached.safetyBackupId !== safetyJob.id) {
      throw new Error('Safety backup was not attached to replace job')
    }

    return { replaceJob: attached, safetyJob, safetyArtifact }
  }

  async commitReplace(
    prepared: ReplacePreparation,
    onProgress?: (progress: ReplaceProgress) => void,
  ): Promise<RestoreReplaceCommitResult> {
    const replaceJob = prepared.replaceJob
    if (replaceJob.mode !== 'replace_all' || replaceJob.status !== 'ready_to_commit') {
      throw new Error('Replace job is not ready to commit')
    }
    if (replaceJob.safetyBackupId !== prepared.safetyJob.id) {
      throw new Error('Replace job safety backup changed unexpectedly')
    }

    const list = await invoke<PromotionListResponse & Record<string, unknown>>(this.client, {
      action: 'list_replace_media_promotion',
      jobId: replaceJob.id,
    })
    const pending = parsePromotions(list.media).filter((item) => !item.promoted)

    for (const [index, item] of pending.entries()) {
      onProgress?.({ stage: 'promotion', completed: index, total: pending.length, detail: item.path })
      await invoke(this.client, {
        action: 'promote_replace_media',
        jobId: replaceJob.id,
        path: item.path,
      })
    }
    onProgress?.({ stage: 'promotion', completed: pending.length, total: pending.length })

    onProgress?.({ stage: 'commit', completed: 0, total: 1 })
    const response = await invoke<ReplaceCommitResponse & Record<string, unknown>>(this.client, {
      action: 'commit_replace_all',
      jobId: replaceJob.id,
    })
    const result = parseReplaceResult(response.result)
    onProgress?.({ stage: 'commit', completed: 1, total: 1 })
    return result
  }
}
