import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.110.9'
import {
  descriptorForPath,
  manifestSha256,
  parseRestoreManifest,
  rebuildAndValidateDataFiles,
  sha256Hex,
  validateDataBatchInput,
  validateStagedMedia,
  type RestoreDataBatch,
  type RestoreManifest,
  type RestoreMediaDescriptor,
  type RestoreMediaStage,
} from './validation.ts'

export const RESTORE_STAGING_BUCKET = 'restore-staging'

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

interface ServerRestoreJob {
  id: string
  pair_id: string
  created_by: string
  mode: RestoreMode
  status: RestoreJobStatus
  manifest_sha256: string
  manifest: unknown
  source_pair_export_id: string
  safety_backup_id: string | null
  rejection_code: string | null
  rejection_detail: string | null
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

function requiredText(value: unknown, label: string, maxLength = 4096): string {
  if (typeof value !== 'string') throw new Error(`${label}_invalid`)
  const result = value.trim()
  if (!result || result.length > maxLength) throw new Error(`${label}_invalid`)
  return result
}

function requiredUuid(value: unknown, label: string): string {
  const result = requiredText(value, label, 64)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    throw new Error(`${label}_invalid`)
  }
  return result
}

function requiredInteger(value: unknown, label: string, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new Error(`${label}_invalid`)
  }
  return value
}

function rowFromRpc(data: unknown): Record<string, unknown> {
  const value = Array.isArray(data) ? data[0] : data
  return object(value, 'restore_rpc_result')
}

function summaryFromRow(row: Record<string, unknown>): RestoreJobSummary {
  const mode = row.mode
  const status = row.status
  if (mode !== 'merge' && mode !== 'replace_all') throw new Error('restore_mode_invalid')
  if (!['uploading', 'validating', 'ready_to_commit', 'committing', 'completed', 'rejected'].includes(String(status))) {
    throw new Error('restore_status_invalid')
  }
  return {
    id: requiredUuid(row.id, 'restore_job_id'),
    pairId: requiredUuid(row.pair_id, 'restore_pair_id'),
    mode,
    status: status as RestoreJobStatus,
    manifestSha256: requiredText(row.manifest_sha256, 'restore_manifest_sha256', 64),
    safetyBackupId: row.safety_backup_id === null || row.safety_backup_id === undefined
      ? null
      : requiredUuid(row.safety_backup_id, 'restore_safety_backup_id'),
    expiresAt: requiredText(row.expires_at, 'restore_expires_at', 64),
  }
}

export async function activePairForUser(admin: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await admin
    .from('pair_members')
    .select('pair_id, activated_at, removed_at')
    .eq('user_id', userId)
    .is('removed_at', null)
    .not('activated_at', 'is', null)
    .maybeSingle()
  if (error) throw new Error('restore_membership_unavailable')
  if (!data?.pair_id) throw new Error('restore_membership_required')
  return requiredUuid(data.pair_id, 'restore_pair_id')
}

async function readServerJob(
  admin: SupabaseClient,
  jobId: string,
  pairId: string,
  userId: string,
): Promise<ServerRestoreJob> {
  const { data, error } = await admin.rpc('read_restore_job_server', {
    p_job_id: jobId,
    p_pair_id: pairId,
    p_actor_user_id: userId,
  })
  if (error) throw new Error('restore_job_read_failed')
  const row = object(data, 'restore_job')
  if (row.id !== jobId || row.pair_id !== pairId || row.created_by !== userId) throw new Error('restore_job_scope_mismatch')
  if (!Array.isArray(row.data_entries) || !Array.isArray(row.media_entries)) throw new Error('restore_job_staging_invalid')
  const mode = row.mode
  const status = row.status
  if (mode !== 'merge' && mode !== 'replace_all') throw new Error('restore_mode_invalid')
  if (!['uploading', 'validating', 'ready_to_commit', 'committing', 'completed', 'rejected'].includes(String(status))) {
    throw new Error('restore_status_invalid')
  }
  return row as unknown as ServerRestoreJob
}

function manifestFromJob(job: ServerRestoreJob): RestoreManifest {
  const manifest = parseRestoreManifest(job.manifest)
  if (manifest.pairExportId !== job.source_pair_export_id) throw new Error('restore_job_manifest_identity_mismatch')
  return manifest
}

function requireUploading(job: ServerRestoreJob): void {
  if (job.status !== 'uploading') throw new Error('restore_job_not_uploading')
  const expires = Date.parse(job.expires_at)
  if (!Number.isFinite(expires) || expires <= Date.now()) throw new Error('restore_job_expired')
}

export async function createRestoreJob(
  admin: SupabaseClient,
  userId: string,
  pairId: string,
  input: { mode: unknown; manifest: unknown },
): Promise<RestoreJobSummary> {
  if (input.mode !== 'merge' && input.mode !== 'replace_all') throw new Error('restore_mode_invalid')
  const manifest = parseRestoreManifest(input.manifest)
  const manifestHash = await manifestSha256(manifest)
  const { data, error } = await admin.rpc('create_restore_job', {
    p_pair_id: pairId,
    p_created_by: userId,
    p_mode: input.mode,
    p_manifest_sha256: manifestHash,
    p_manifest: manifest,
    p_source_pair_export_id: manifest.pairExportId,
  })
  if (error) throw new Error('restore_job_create_failed')
  return summaryFromRow(rowFromRpc(data))
}

export async function stageRestoreDataBatch(
  admin: SupabaseClient,
  userId: string,
  pairId: string,
  input: Record<string, unknown>,
): Promise<void> {
  const jobId = requiredUuid(input.jobId, 'restore_job_id')
  const job = await readServerJob(admin, jobId, pairId, userId)
  requireUploading(job)
  const manifest = manifestFromJob(job)
  const batch = validateDataBatchInput({
    manifest,
    path: input.path,
    batchIndex: input.batchIndex,
    fileSha256: input.fileSha256,
    fileByteSize: input.fileByteSize,
    payload: input.payload,
  })

  const { error } = await admin.rpc('stage_restore_data_batch', {
    p_job_id: jobId,
    p_pair_id: pairId,
    p_actor_user_id: userId,
    p_path: batch.path,
    p_batch_index: batch.batchIndex,
    p_file_sha256: batch.fileSha256,
    p_file_byte_size: batch.fileByteSize,
    p_payload: batch.payload,
    p_payload_byte_size: batch.payloadByteSize,
  })
  if (error) throw new Error('restore_data_stage_failed')
}

function mediaDescriptor(manifest: RestoreManifest, rawPath: unknown): RestoreMediaDescriptor {
  const path = requiredText(rawPath, 'restore_media_path', 512)
  const descriptor = descriptorForPath(manifest, path)
  if (!descriptor || !('mediaType' in descriptor)) throw new Error('restore_media_not_declared')
  return descriptor
}

export function restoreMediaStoragePath(pairId: string, jobId: string, archivePath: string): string {
  if (!archivePath.startsWith('media/')) throw new Error('restore_media_path_invalid')
  const relative = archivePath.slice('media/'.length)
  if (!relative || relative.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('restore_media_path_invalid')
  }
  return `${pairId}/${jobId}/${relative}`
}

export async function prepareRestoreMediaUpload(
  admin: SupabaseClient,
  userId: string,
  pairId: string,
  input: Record<string, unknown>,
): Promise<{ path: string; storagePath: string; token: string }> {
  const jobId = requiredUuid(input.jobId, 'restore_job_id')
  const job = await readServerJob(admin, jobId, pairId, userId)
  requireUploading(job)
  const manifest = manifestFromJob(job)
  const descriptor = mediaDescriptor(manifest, input.path)
  if (job.media_entries.some((entry) => entry.path === descriptor.path)) throw new Error('restore_media_already_confirmed')
  const storagePath = restoreMediaStoragePath(pairId, jobId, descriptor.path)

  const { data, error } = await admin.storage
    .from(RESTORE_STAGING_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false })
  if (error || !data?.token) throw new Error('restore_media_upload_prepare_failed')
  return { path: descriptor.path, storagePath, token: data.token }
}

export async function confirmRestoreMedia(
  admin: SupabaseClient,
  userId: string,
  pairId: string,
  input: Record<string, unknown>,
): Promise<void> {
  const jobId = requiredUuid(input.jobId, 'restore_job_id')
  const job = await readServerJob(admin, jobId, pairId, userId)
  requireUploading(job)
  const manifest = manifestFromJob(job)
  const descriptor = mediaDescriptor(manifest, input.path)
  const expectedStoragePath = restoreMediaStoragePath(pairId, jobId, descriptor.path)
  if (input.storagePath !== expectedStoragePath) throw new Error('restore_media_storage_path_mismatch')

  const { data: blob, error: downloadError } = await admin.storage
    .from(RESTORE_STAGING_BUCKET)
    .download(expectedStoragePath)
  if (downloadError || !blob) throw new Error('restore_media_download_failed')
  if (blob.size !== descriptor.bytes) throw new Error('restore_media_size_mismatch')
  if (blob.type && blob.type !== descriptor.mediaType) throw new Error('restore_media_type_mismatch')
  const hash = await sha256Hex(await blob.arrayBuffer())
  if (hash !== descriptor.sha256) throw new Error('restore_media_checksum_mismatch')

  const { error } = await admin.rpc('stage_restore_media_entry', {
    p_job_id: jobId,
    p_pair_id: pairId,
    p_actor_user_id: userId,
    p_path: descriptor.path,
    p_sha256: descriptor.sha256,
    p_byte_size: descriptor.bytes,
    p_media_type: descriptor.mediaType,
    p_storage_path: expectedStoragePath,
  })
  if (error) throw new Error('restore_media_stage_failed')
}

function mapDataBatch(value: ServerRestoreJob['data_entries'][number]): RestoreDataBatch {
  return {
    path: requiredText(value.path, 'restore_staged_data_path', 512),
    batchIndex: requiredInteger(value.batch_index, 'restore_staged_batch_index', 100_000),
    fileSha256: requiredText(value.file_sha256, 'restore_staged_file_sha', 64),
    fileByteSize: requiredInteger(value.file_byte_size, 'restore_staged_file_bytes', 64 * 1024 * 1024),
    payload: value.payload,
    payloadByteSize: requiredInteger(value.payload_byte_size, 'restore_staged_payload_bytes', 1024 * 1024),
  }
}

function mapMediaStage(value: ServerRestoreJob['media_entries'][number]): RestoreMediaStage {
  return {
    path: requiredText(value.path, 'restore_staged_media_path', 512),
    sha256: requiredText(value.sha256, 'restore_staged_media_sha', 64),
    byteSize: requiredInteger(value.byte_size, 'restore_staged_media_bytes', 25 * 1024 * 1024),
    mediaType: requiredText(value.media_type, 'restore_staged_media_type', 100),
    storagePath: requiredText(value.storage_path, 'restore_staged_storage_path', 1024),
  }
}

export async function finalizeRestoreStaging(
  admin: SupabaseClient,
  userId: string,
  pairId: string,
  input: Record<string, unknown>,
): Promise<RestoreJobSummary> {
  const jobId = requiredUuid(input.jobId, 'restore_job_id')
  let validationStarted = false
  try {
    const before = await readServerJob(admin, jobId, pairId, userId)
    requireUploading(before)
    const initialManifest = manifestFromJob(before)
    if (await manifestSha256(initialManifest) !== before.manifest_sha256) throw new Error('restore_manifest_hash_mismatch')

    const { error: beginError } = await admin.rpc('begin_restore_validation', {
      p_job_id: jobId,
      p_pair_id: pairId,
      p_actor_user_id: userId,
    })
    if (beginError) throw new Error('restore_validation_begin_failed')
    validationStarted = true

    const job = await readServerJob(admin, jobId, pairId, userId)
    if (job.status !== 'validating') throw new Error('restore_job_not_validating')
    const manifest = manifestFromJob(job)
    if (await manifestSha256(manifest) !== job.manifest_sha256) throw new Error('restore_manifest_hash_mismatch')

    const rebuilt = await rebuildAndValidateDataFiles(manifest, job.data_entries.map(mapDataBatch))
    if (!rebuilt.sourcePairId) throw new Error('restore_source_pair_missing')
    const mediaStages = job.media_entries.map(mapMediaStage)
    validateStagedMedia(manifest, mediaStages)
    for (const stage of mediaStages) {
      if (stage.storagePath !== restoreMediaStoragePath(pairId, jobId, stage.path)) {
        throw new Error(`restore_staged_media_namespace_mismatch:${stage.path}`)
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

    const ready = await readServerJob(admin, jobId, pairId, userId)
    return summaryFromRow(ready as unknown as Record<string, unknown>)
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

export async function readRestoreJobSummary(
  admin: SupabaseClient,
  userId: string,
  pairId: string,
  rawJobId: unknown,
): Promise<RestoreJobSummary> {
  const jobId = requiredUuid(rawJobId, 'restore_job_id')
  const job = await readServerJob(admin, jobId, pairId, userId)
  return summaryFromRow(job as unknown as Record<string, unknown>)
}
