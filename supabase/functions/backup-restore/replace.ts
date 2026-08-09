import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.110.9'
import { finalRestoreMediaPath } from './commit.ts'
import { readRestoreJobSummary, RESTORE_STAGING_BUCKET } from './staging.ts'
import { sha256Hex } from './validation.ts'

const RECIPE_MEDIA_BUCKET = 'recipe-media'

interface ReplacePromotionRow {
  path: string
  sha256: string
  byteSize: number
  mediaType: string
  storagePath: string
  promotedStoragePath: string | null
  promotedAt: string | null
}

export interface RestoreReplaceResult {
  insertedCount: number
  updatedCount: number
  replacedCount: number
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}_invalid`)
  return value as Record<string, unknown>
}

function text(value: unknown, label: string, maxLength = 1024): string {
  if (typeof value !== 'string') throw new Error(`${label}_invalid`)
  const normalized = value.trim()
  if (!normalized || normalized.length > maxLength) throw new Error(`${label}_invalid`)
  return normalized
}

function nullableText(value: unknown, label: string, maxLength = 1024): string | null {
  if (value === null || value === undefined) return null
  return text(value, label, maxLength)
}

function integer(value: unknown, label: string, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new Error(`${label}_invalid`)
  }
  return value
}

function uuid(value: unknown, label: string): string {
  const candidate = text(value, label, 64).toLowerCase()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(candidate)) {
    throw new Error(`${label}_invalid`)
  }
  return candidate
}

function digest(value: unknown, label: string): string {
  const candidate = text(value, label, 64).toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(candidate)) throw new Error(`${label}_invalid`)
  return candidate
}

function promotionRow(value: unknown): ReplacePromotionRow {
  const row = record(value, 'replace_promotion_row')
  return {
    path: text(row.path, 'replace_media_path', 512),
    sha256: digest(row.sha256, 'replace_media_sha256'),
    byteSize: integer(row.byte_size, 'replace_media_byte_size', 25 * 1024 * 1024),
    mediaType: text(row.media_type, 'replace_media_type', 100).toLowerCase(),
    storagePath: text(row.storage_path, 'replace_staged_storage_path', 1024),
    promotedStoragePath: nullableText(row.promoted_storage_path, 'replace_promoted_storage_path', 1024),
    promotedAt: nullableText(row.promoted_at, 'replace_promoted_at', 64),
  }
}

async function readPromotionRows(
  admin: SupabaseClient,
  userId: string,
  pairId: string,
  jobId: string,
): Promise<ReplacePromotionRow[]> {
  const { data, error } = await admin.rpc('read_restore_media_promotion_server', {
    p_job_id: jobId,
    p_pair_id: pairId,
    p_actor_user_id: userId,
  })
  if (error) throw new Error('replace_media_promotion_read_failed')
  if (!Array.isArray(data)) throw new Error('replace_media_promotion_rows_invalid')
  return data.map(promotionRow)
}

function storageErrorLooksMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const row = error as Record<string, unknown>
  const status = String(row.statusCode ?? row.status ?? '')
  const message = String(row.message ?? row.error ?? '').toLocaleLowerCase('en-US')
  return status === '404' || (status === '400' && message.includes('not found')) || message.includes('object not found')
}

async function verifyBlob(blob: Blob, row: ReplacePromotionRow, label: string): Promise<void> {
  if (blob.size !== row.byteSize) throw new Error(`${label}_size_mismatch`)
  if (blob.type && blob.type !== row.mediaType) throw new Error(`${label}_type_mismatch`)
  if (await sha256Hex(await blob.arrayBuffer()) !== row.sha256) throw new Error(`${label}_checksum_mismatch`)
}

async function destinationAlreadyMatches(
  admin: SupabaseClient,
  path: string,
  row: ReplacePromotionRow,
): Promise<boolean> {
  const { data, error } = await admin.storage.from(RECIPE_MEDIA_BUCKET).download(path)
  if (error || !data) {
    if (storageErrorLooksMissing(error)) return false
    throw new Error('replace_promoted_media_probe_failed')
  }
  await verifyBlob(data, row, 'replace_existing_media')
  return true
}

async function ensureReplaceReady(
  admin: SupabaseClient,
  userId: string,
  pairId: string,
  rawJobId: unknown,
) {
  const jobId = uuid(rawJobId, 'replace_job_id')
  const job = await readRestoreJobSummary(admin, userId, pairId, jobId)
  if (job.mode !== 'replace_all' || job.status !== 'ready_to_commit' || !job.safetyBackupId) {
    throw new Error('replace_job_not_ready')
  }
  return { jobId, job }
}

export async function attachRestoreSafetyBackup(
  admin: SupabaseClient,
  userId: string,
  pairId: string,
  input: { replaceJobId: unknown; safetyJobId: unknown },
) {
  const replaceJobId = uuid(input.replaceJobId, 'replace_job_id')
  const safetyJobId = uuid(input.safetyJobId, 'safety_job_id')
  const { error } = await admin.rpc('attach_restore_safety_backup', {
    p_replace_job_id: replaceJobId,
    p_safety_job_id: safetyJobId,
    p_pair_id: pairId,
    p_actor_user_id: userId,
  })
  if (error) throw new Error('replace_safety_attach_failed')

  const job = await readRestoreJobSummary(admin, userId, pairId, replaceJobId)
  if (job.safetyBackupId !== safetyJobId) throw new Error('replace_safety_attach_not_persisted')
  return job
}

export async function listReplaceMediaPromotion(
  admin: SupabaseClient,
  userId: string,
  pairId: string,
  rawJobId: unknown,
): Promise<Array<{ path: string; promoted: boolean }>> {
  const { jobId } = await ensureReplaceReady(admin, userId, pairId, rawJobId)
  const rows = await readPromotionRows(admin, userId, pairId, jobId)
  return rows.map((row) => ({ path: row.path, promoted: row.promotedAt !== null && row.promotedStoragePath !== null }))
}

export async function promoteReplaceMedia(
  admin: SupabaseClient,
  userId: string,
  pairId: string,
  input: { jobId: unknown; path: unknown },
): Promise<{ path: string; promotedStoragePath: string }> {
  const { jobId } = await ensureReplaceReady(admin, userId, pairId, input.jobId)
  const requestedPath = text(input.path, 'replace_media_path', 512)
  const rows = await readPromotionRows(admin, userId, pairId, jobId)
  const row = rows.find((item) => item.path === requestedPath)
  if (!row) throw new Error('replace_media_promotion_row_missing')
  const finalPath = finalRestoreMediaPath(pairId, userId, row)

  if (row.promotedStoragePath !== null || row.promotedAt !== null) {
    if (row.promotedStoragePath !== finalPath || row.promotedAt === null) throw new Error('replace_media_promotion_state_invalid')
    if (!await destinationAlreadyMatches(admin, finalPath, row)) throw new Error('replace_promoted_media_missing')
    return { path: row.path, promotedStoragePath: finalPath }
  }

  if (!await destinationAlreadyMatches(admin, finalPath, row)) {
    const { data: staged, error: stagedError } = await admin.storage.from(RESTORE_STAGING_BUCKET).download(row.storagePath)
    if (stagedError || !staged) throw new Error('replace_staged_media_download_failed')
    await verifyBlob(staged, row, 'replace_staged_media')

    const { error: uploadError } = await admin.storage.from(RECIPE_MEDIA_BUCKET).upload(finalPath, staged, {
      contentType: row.mediaType,
      upsert: false,
    })
    if (uploadError && !await destinationAlreadyMatches(admin, finalPath, row)) {
      throw new Error('replace_media_promotion_upload_failed')
    }
  }

  const { error: markError } = await admin.rpc('mark_restore_media_promoted', {
    p_job_id: jobId,
    p_pair_id: pairId,
    p_actor_user_id: userId,
    p_path: row.path,
    p_promoted_storage_path: finalPath,
  })
  if (markError) throw new Error('replace_media_promotion_mark_failed')
  return { path: row.path, promotedStoragePath: finalPath }
}

function replaceResult(data: unknown): RestoreReplaceResult {
  const value = Array.isArray(data) ? data[0] : data
  const row = record(value, 'replace_commit_result')
  return {
    insertedCount: integer(row.inserted_count, 'replace_inserted_count'),
    updatedCount: integer(row.updated_count, 'replace_updated_count'),
    replacedCount: integer(row.replaced_count, 'replace_replaced_count'),
  }
}

export async function commitRestoreReplaceAll(
  admin: SupabaseClient,
  userId: string,
  pairId: string,
  rawJobId: unknown,
): Promise<RestoreReplaceResult> {
  const { jobId } = await ensureReplaceReady(admin, userId, pairId, rawJobId)
  const rows = await readPromotionRows(admin, userId, pairId, jobId)
  for (const row of rows) {
    const finalPath = finalRestoreMediaPath(pairId, userId, row)
    if (row.promotedAt === null || row.promotedStoragePath !== finalPath) throw new Error('replace_media_not_fully_promoted')
  }

  const { data, error } = await admin.rpc('commit_restore_replace_all_checked', {
    p_job_id: jobId,
    p_pair_id: pairId,
    p_actor_user_id: userId,
  })
  if (error) throw new Error('replace_commit_failed')
  const result = replaceResult(data)

  if (rows.length > 0) {
    await admin.storage.from(RESTORE_STAGING_BUCKET).remove(rows.map((row) => row.storagePath)).catch(() => undefined)
  }
  return result
}
