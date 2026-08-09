import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.110.9'
import { validateRestorePhotoMediaLinkage } from './media-linkage.ts'
import { restoreMediaStoragePath, type RestoreJobSummary, type RestoreJobStatus, type RestoreMode } from './staging.ts'
import {
  manifestSha256,
  parseRestoreManifest,
  rebuildAndValidateDataFiles,
  validateStagedMedia,
  type RestoreDataBatch,
  type RestoreMediaStage,
} from './validation.ts'

interface StrictServerJob {
  id: string
  pair_id: string
  created_by: string
  mode: RestoreMode
  status: RestoreJobStatus
  manifest_sha256: string
  manifest: unknown
  source_pair_export_id: string
  safety_backup_id: string | null
  expires_at: string
  data_entries: Array<{
    path: string
    batch_index: number
    file_sha256: string
    file_byte_size: number
    payload: unknown
    payload_byte_size: number
  }>
  media_entries: Array<{
    path: string
    sha256: string
    byte_size: number
    media_type: string
    storage_path: string
  }>
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}_invalid`)
  return value as Record<string, unknown>
}

function text(value: unknown, label: string, maxLength = 4096): string {
  if (typeof value !== 'string') throw new Error(`${label}_invalid`)
  const normalized = value.trim()
  if (!normalized || normalized.length > maxLength) throw new Error(`${label}_invalid`)
  return normalized
}

function integer(value: unknown, label: string, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new Error(`${label}_invalid`)
  }
  return value
}

async function readJob(
  admin: SupabaseClient,
  userId: string,
  pairId: string,
  jobId: string,
): Promise<StrictServerJob> {
  const { data, error } = await admin.rpc('read_restore_job_server', {
    p_job_id: jobId,
    p_pair_id: pairId,
    p_actor_user_id: userId,
  })
  if (error) throw new Error('restore_job_read_failed')
  const row = object(data, 'restore_job')
  if (row.id !== jobId || row.pair_id !== pairId || row.created_by !== userId) throw new Error('restore_job_scope_mismatch')
  if (!Array.isArray(row.data_entries) || !Array.isArray(row.media_entries)) throw new Error('restore_job_staging_invalid')
  if (row.mode !== 'merge' && row.mode !== 'replace_all') throw new Error('restore_mode_invalid')
  if (!['uploading', 'validating', 'ready_to_commit', 'committing', 'completed', 'rejected'].includes(String(row.status))) {
    throw new Error('restore_status_invalid')
  }
  return row as unknown as StrictServerJob
}

function dataBatch(row: StrictServerJob['data_entries'][number]): RestoreDataBatch {
  return {
    path: text(row.path, 'restore_data_path', 512),
    batchIndex: integer(row.batch_index, 'restore_batch_index', 100_000),
    fileSha256: text(row.file_sha256, 'restore_file_sha', 64),
    fileByteSize: integer(row.file_byte_size, 'restore_file_size', 64 * 1024 * 1024),
    payload: row.payload,
    payloadByteSize: integer(row.payload_byte_size, 'restore_batch_size', 1024 * 1024),
  }
}

function mediaStage(row: StrictServerJob['media_entries'][number]): RestoreMediaStage {
  return {
    path: text(row.path, 'restore_media_path', 512),
    sha256: text(row.sha256, 'restore_media_sha', 64),
    byteSize: integer(row.byte_size, 'restore_media_size', 25 * 1024 * 1024),
    mediaType: text(row.media_type, 'restore_media_type', 100),
    storagePath: text(row.storage_path, 'restore_storage_path', 1024),
  }
}

function summary(job: StrictServerJob): RestoreJobSummary {
  return {
    id: job.id,
    pairId: job.pair_id,
    mode: job.mode,
    status: job.status,
    manifestSha256: job.manifest_sha256,
    safetyBackupId: job.safety_backup_id,
    expiresAt: job.expires_at,
  }
}

export async function finalizeRestoreStagingStrict(
  admin: SupabaseClient,
  userId: string,
  pairId: string,
  rawJobId: unknown,
): Promise<RestoreJobSummary> {
  const jobId = text(rawJobId, 'restore_job_id', 64)
  let validationStarted = false
  try {
    const before = await readJob(admin, userId, pairId, jobId)
    if (before.status !== 'uploading') throw new Error('restore_job_not_uploading')
    if (Date.parse(before.expires_at) <= Date.now()) throw new Error('restore_job_expired')
    const initialManifest = parseRestoreManifest(before.manifest)
    if (initialManifest.pairExportId !== before.source_pair_export_id) throw new Error('restore_manifest_identity_mismatch')
    if (await manifestSha256(initialManifest) !== before.manifest_sha256) throw new Error('restore_manifest_hash_mismatch')

    const { error: beginError } = await admin.rpc('begin_restore_validation', {
      p_job_id: jobId,
      p_pair_id: pairId,
      p_actor_user_id: userId,
    })
    if (beginError) throw new Error('restore_validation_begin_failed')
    validationStarted = true

    const job = await readJob(admin, userId, pairId, jobId)
    if (job.status !== 'validating') throw new Error('restore_job_not_validating')
    const manifest = parseRestoreManifest(job.manifest)
    if (manifest.pairExportId !== job.source_pair_export_id) throw new Error('restore_manifest_identity_mismatch')
    if (await manifestSha256(manifest) !== job.manifest_sha256) throw new Error('restore_manifest_hash_mismatch')

    const rebuilt = await rebuildAndValidateDataFiles(manifest, job.data_entries.map(dataBatch))
    validateRestorePhotoMediaLinkage(manifest, rebuilt.data)

    const stagedMedia = job.media_entries.map(mediaStage)
    validateStagedMedia(manifest, stagedMedia)
    for (const item of stagedMedia) {
      if (item.storagePath !== restoreMediaStoragePath(pairId, jobId, item.path)) {
        throw new Error(`restore_media_namespace_mismatch:${item.path}`)
      }
    }

    const { error: finishError } = await admin.rpc('finish_restore_validation', {
      p_job_id: jobId,
      p_pair_id: pairId,
      p_actor_user_id: userId,
      p_valid: true,
      p_rejection_code: null,
      p_rejection_detail: null,
    })
    if (finishError) throw new Error('restore_validation_finish_failed')

    const ready = await readJob(admin, userId, pairId, jobId)
    if (ready.status !== 'ready_to_commit') throw new Error('restore_job_not_ready')
    return summary(ready)
  } catch (error) {
    if (validationStarted) {
      const detail = error instanceof Error ? error.message : 'restore_validation_failed'
      await admin.rpc('finish_restore_validation', {
        p_job_id: jobId,
        p_pair_id: pairId,
        p_actor_user_id: userId,
        p_valid: false,
        p_rejection_code: 'server_preflight_failed',
        p_rejection_detail: detail.slice(0, 1000),
      })
    }
    throw error
  }
}
