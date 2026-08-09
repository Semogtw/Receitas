import { BlobReader, BlobWriter, ZipReader } from '@zip.js/zip.js'
import type { BackupManifest, BackupMediaFileDescriptor } from '../domain/complete-backup-format'
import { inspectCompleteBackupArchive, type CompleteBackupInspection } from './complete-backup-inspector'
import { RESTORE_DATA_BATCH_TARGET_BYTES, splitRestoreDataBatches } from './restore-staging-batches'

export type RestoreMode = 'merge' | 'replace_all'
export type RestoreJobStatus = 'uploading' | 'validating' | 'ready_to_commit' | 'committing' | 'completed' | 'rejected'

export interface RestoreJobSummary {
  id: string
  pairId: string
  mode: RestoreMode
  status: RestoreJobStatus
  manifestSha256: string
  safetyBackupId: string | null
  expiresAt: string
}

export interface RestoreStagingProgress {
  stage: 'preflight' | 'create_job' | 'data' | 'media' | 'finalize'
  completed: number
  total: number
  detail?: string
}

interface FunctionsClient {
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

interface RestoreJobResponse {
  job?: unknown
}

interface RestoreUploadResponse {
  upload?: unknown
}

interface ArchiveMediaEntry {
  filename: string
  getData(writer: BlobWriter): Promise<Blob>
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} is invalid`)
  return value as Record<string, unknown>
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is invalid`)
  return value
}

function parseJob(value: unknown): RestoreJobSummary {
  const row = record(value, 'Restore job')
  const mode = row.mode
  const status = row.status
  if (mode !== 'merge' && mode !== 'replace_all') throw new Error('Restore job mode is invalid')
  if (!['uploading', 'validating', 'ready_to_commit', 'committing', 'completed', 'rejected'].includes(String(status))) {
    throw new Error('Restore job status is invalid')
  }
  return {
    id: requiredString(row.id, 'Restore job id'),
    pairId: requiredString(row.pairId, 'Restore pair id'),
    mode,
    status: status as RestoreJobStatus,
    manifestSha256: requiredString(row.manifestSha256, 'Restore manifest hash'),
    safetyBackupId: row.safetyBackupId === null || row.safetyBackupId === undefined
      ? null
      : requiredString(row.safetyBackupId, 'Restore safety backup id'),
    expiresAt: requiredString(row.expiresAt, 'Restore expiry'),
  }
}

function parseUpload(value: unknown): { path: string; storagePath: string; token: string } {
  const row = record(value, 'Restore media upload')
  return {
    path: requiredString(row.path, 'Restore media path'),
    storagePath: requiredString(row.storagePath, 'Restore media storage path'),
    token: requiredString(row.token, 'Restore media upload token'),
  }
}

async function invoke<T extends Record<string, unknown>>(
  client: FunctionsClient,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.functions.invoke<T>('backup-restore', { body })
  if (error || !data) throw new Error(`Restore staging request failed: ${String((error as { message?: unknown } | null)?.message ?? 'unknown')}`)
  return data
}

async function createJob(
  client: FunctionsClient,
  mode: RestoreMode,
  manifest: BackupManifest,
): Promise<RestoreJobSummary> {
  const response = await invoke<RestoreJobResponse & Record<string, unknown>>(client, {
    action: 'create_job',
    mode,
    manifest,
  })
  return parseJob(response.job)
}

async function stageData(
  client: FunctionsClient,
  jobId: string,
  inspection: CompleteBackupInspection,
  onProgress?: (progress: RestoreStagingProgress) => void,
): Promise<void> {
  const allBatches = inspection.manifest.dataFiles.flatMap((descriptor) => splitRestoreDataBatches({
    path: descriptor.path,
    value: inspection.data.get(descriptor.path),
    descriptors: inspection.manifest.dataFiles,
  }))

  for (const [index, batch] of allBatches.entries()) {
    onProgress?.({
      stage: 'data',
      completed: index,
      total: allBatches.length,
      detail: `${batch.path} · lote ${batch.batchIndex + 1}`,
    })
    await invoke(client, {
      action: 'stage_data',
      jobId,
      path: batch.path,
      batchIndex: batch.batchIndex,
      fileSha256: batch.fileSha256,
      fileByteSize: batch.fileByteSize,
      payload: batch.payload,
    })
  }
  onProgress?.({ stage: 'data', completed: allBatches.length, total: allBatches.length })
}

function expectedMediaDescriptor(
  descriptors: readonly BackupMediaFileDescriptor[],
  path: string,
): BackupMediaFileDescriptor {
  const descriptor = descriptors.find((entry) => entry.path === path)
  if (!descriptor) throw new Error(`Restore media descriptor not found for ${path}`)
  return descriptor
}

async function stageMedia(
  client: FunctionsClient,
  archive: Blob,
  jobId: string,
  inspection: CompleteBackupInspection,
  onProgress?: (progress: RestoreStagingProgress) => void,
): Promise<void> {
  if (inspection.manifest.mediaFiles.length === 0) {
    onProgress?.({ stage: 'media', completed: 0, total: 0 })
    return
  }

  const reader = new ZipReader(new BlobReader(archive))
  try {
    const entries = await reader.getEntries() as unknown as ArchiveMediaEntry[]
    const byPath = new Map(entries.map((entry) => [entry.filename, entry]))

    for (const [index, listedDescriptor] of inspection.manifest.mediaFiles.entries()) {
      const descriptor = expectedMediaDescriptor(inspection.manifest.mediaFiles, listedDescriptor.path)
      const entry = byPath.get(descriptor.path)
      if (!entry) throw new Error(`Validated archive lost media entry ${descriptor.path}`)

      onProgress?.({
        stage: 'media',
        completed: index,
        total: inspection.manifest.mediaFiles.length,
        detail: descriptor.path,
      })

      const prepared = await invoke<RestoreUploadResponse & Record<string, unknown>>(client, {
        action: 'prepare_media_upload',
        jobId,
        path: descriptor.path,
      })
      const upload = parseUpload(prepared.upload)
      if (upload.path !== descriptor.path) throw new Error('Restore server returned a mismatched media upload path')

      const blob = await entry.getData(new BlobWriter(descriptor.mediaType))
      if (blob.size !== descriptor.bytes) throw new Error(`Restore media size changed after preflight: ${descriptor.path}`)

      const { error: uploadError } = await client.storage
        .from('restore-staging')
        .uploadToSignedUrl(upload.storagePath, upload.token, blob, { contentType: descriptor.mediaType })
      if (uploadError) throw new Error(`Restore media upload failed for ${descriptor.path}`)

      await invoke(client, {
        action: 'confirm_media',
        jobId,
        path: descriptor.path,
        storagePath: upload.storagePath,
      })
    }

    onProgress?.({
      stage: 'media',
      completed: inspection.manifest.mediaFiles.length,
      total: inspection.manifest.mediaFiles.length,
    })
  } finally {
    await reader.close()
  }
}

export class RestoreStagingService {
  constructor(private readonly client: FunctionsClient) {}

  async stageArchive(
    archive: Blob,
    mode: RestoreMode,
    onProgress?: (progress: RestoreStagingProgress) => void,
  ): Promise<RestoreJobSummary> {
    onProgress?.({ stage: 'preflight', completed: 0, total: 1 })
    const inspection = await inspectCompleteBackupArchive(archive)
    onProgress?.({ stage: 'preflight', completed: 1, total: 1 })

    onProgress?.({ stage: 'create_job', completed: 0, total: 1 })
    const job = await createJob(this.client, mode, inspection.manifest)
    if (job.status !== 'uploading') throw new Error('Restore server created a job in an unexpected state')
    onProgress?.({ stage: 'create_job', completed: 1, total: 1 })

    await stageData(this.client, job.id, inspection, onProgress)
    await stageMedia(this.client, archive, job.id, inspection, onProgress)

    onProgress?.({ stage: 'finalize', completed: 0, total: 1 })
    const response = await invoke<RestoreJobResponse & Record<string, unknown>>(this.client, {
      action: 'finalize_staging',
      jobId: job.id,
    })
    const ready = parseJob(response.job)
    if (ready.status !== 'ready_to_commit') throw new Error('Restore server did not finish preflight in ready state')
    onProgress?.({ stage: 'finalize', completed: 1, total: 1 })
    return ready
  }
}

export { RESTORE_DATA_BATCH_TARGET_BYTES }
