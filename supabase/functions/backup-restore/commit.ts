import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.110.9'
import { readRestoreJobSummary, RESTORE_STAGING_BUCKET } from './staging.ts'
import { sha256Hex } from './validation.ts'

const RECIPE_MEDIA_BUCKET = 'recipe-media'

interface PromotionRow {
  path: string
  sha256: string
  byteSize: number
  mediaType: string
  storagePath: string
  promotedStoragePath: string | null
  promotedAt: string | null
}

export interface RestoreMergeResult {
  insertedCount: number
  noopCount: number
  conflictCount: number
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

function sha(value: unknown, label: string): string {
  const candidate = text(value, label, 64).toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(candidate)) throw new Error(`${label}_invalid`)
  return candidate
}

function promotionRow(value: unknown): PromotionRow {
  const row = record(value, 'restore_promotion_row')
  return {
    path: text(row.path, 'restore_media_path', 512),
    sha256: sha(row.sha256, 'restore_media_sha256'),
    byteSize: integer(row.byte_size, 'restore_media_byte_size', 25 * 1024 * 1024),
    mediaType: text(row.media_type, 'restore_media_type', 100).toLowerCase(),
    storagePath: text(row.storage_path, 'restore_staged_storage_path', 1024),
    promotedStoragePath: nullableText(row.promoted_storage_path, 'restore_promoted_storage_path', 1024),
    promotedAt: nullableText(row.promoted_at, 'restore_promoted_at', 64),
  }
}

async function readPromotionRows(
  admin: SupabaseClient,
  userId: string,
  pairId: string,
  jobId: string,
): Promise<PromotionRow[]> {
  const { data, error } = await admin.rpc('read_restore_media_promotion_server', {
    p_job_id: jobId,
    p_pair_id: pairId,
    p_actor_user_id: userId,
  })
  if (error) throw new Error('restore_media_promotion_read_failed')
  if (!Array.isArray(data)) throw new Error('restore_media_promotion_rows_invalid')
  return data.map(promotionRow)
}

function extensionForMime(mediaType: string): string {
  switch (mediaType) {
    case 'image/jpeg': return 'jpg'
    case 'image/png': return 'png'
    case 'image/webp': return 'webp'
    case 'image/heic': return 'heic'
    case 'image/heif': return 'heif'
    default: throw new Error('restore_media_type_invalid')
  }
}

export function finalRestoreMediaPath(
  pairId: string,
  actorUserId: string,
  row: Pick<PromotionRow, 'path' | 'sha256' | 'mediaType'>,
): string {
  const pair = uuid(pairId, 'restore_pair_id')
  const actor = uuid(actorUserId, 'restore_actor_id')
  const digest = sha(row.sha256, 'restore_media_sha256')
  const extension = extensionForMime(row.mediaType)
  const match = /^media\/([0-9a-fA-F-]{36})\.([A-Za-z0-9]+)$/.exec(row.path)
  if (!match) throw new Error('restore_media_path_invalid')
  const photoId = uuid(match[1], 'restore_photo_id')
  if (match[2]!.toLowerCase() !== extension) throw new Error('restore_media_extension_mismatch')
  return `${pair}/${actor}/restore/${photoId}-${digest}.${extension}`
}

function storageErrorLooksMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const row = error as Record<string, unknown>
  const status = String(row.statusCode ?? row.status ?? '')
  const message = String(row.message ?? row.error ?? '').toLocaleLowerCase('en-US')
  return status === '404' || (status === '400' && message.includes('not found')) || message.includes('object not found')
}

async function verifyBlob(
  blob: Blob,
  row: Pick<PromotionRow, 'path' | 'sha256' | 'byteSize' | 'mediaType'>,
  label: string,
): Promise<void> {
  if (blob.size !== row.byteSize) throw new Error(`${label}_size_mismatch`)
  if (blob.type && blob.type !== row.mediaType) throw new Error(`${label}_type_mismatch`)
  if (await sha256Hex(await blob.arrayBuffer()) !== row.sha256) throw new Error(`${label}_checksum_mismatch`)
}

async function downloadVerified(
  admin: SupabaseClient,
  bucket: string,
  path: string,
  row: PromotionRow,
  label: string,
): Promise<Blob> {
  const { data, error } = await admin.storage.from(bucket).download(path)
  if (error || !data) throw new Error(`${label}_download_failed`)
  await verifyBlob(data, row, label)
  return data
}

async function destinationAlreadyMatches(
  admin: SupabaseClient,
  path: string,
  row: PromotionRow,
): Promise<boolean> {
  const { data, error } = await admin.storage.from(RECIPE_MEDIA_BUCKET).download(path)
  if (error || !data) {
    if (storageErrorLooksMissing(error)) return false
    throw new Error('restore_promoted_media_probe_failed')
  }
  await verifyBlob(data, row, 'restore_existing_media')
  return true
}

async function markPromoted(
  admin: SupabaseClient,
  userId: string,
  pairId: string,
  jobId: string,
  row: PromotionRow,
  finalPath: string,
): Promise<void> {
  const { error } = await admin.rpc('mark_restore_media_promoted', {
    p_job_id: jobId,
    p_pair_id: pairId,
    p_actor_user_id: userId,
    p_path: row.path,
    p_promoted_storage_path: finalPath,
  })
  if (error) throw new Error('restore_media_promotion_mark_failed')
}

export async function listRestoreMediaPromotion(
  admin: SupabaseClient,
  userId: string,
  pairId: string,
  rawJobId: unknown,
): Promise<Array<{ path: string; promoted: boolean }>> {
  const jobId = uuid(rawJobId, 'restore_job_id')
  const job = await readRestoreJobSummary(admin, userId, pairId, jobId)
  if (job.mode !== 'merge' || job.status !== 'ready_to_commit') throw new Error('restore_job_not_ready_for_promotion')
  const rows = await readPromotionRows(admin, userId, pairId, jobId)
  return rows.map((row) => ({ path: row.path, promoted: row.promotedAt !== null && row.promotedStoragePath !== null }))
}

export async function promoteRestoreMedia(
  admin: SupabaseClient,
  userId: string,
  pairId: string,
  input: { jobId: unknown; path: unknown },
): Promise<{ path: string; promotedStoragePath: string }> {
  const jobId = uuid(input.jobId, 'restore_job_id')
  const requestedPath = text(input.path, 'restore_media_path', 512)
  const job = await readRestoreJobSummary(admin, userId, pairId, jobId)
  if (job.mode !== 'merge' || job.status !== 'ready_to_commit') throw new Error('restore_job_not_ready_for_promotion')

  const rows = await readPromotionRows(admin, userId, pairId, jobId)
  const row = rows.find((item) => item.path === requestedPath)
  if (!row) throw new Error('restore_media_promotion_row_missing')
  const finalPath = finalRestoreMediaPath(pairId, userId, row)

  if (row.promotedStoragePath !== null || row.promotedAt !== null) {
    if (row.promotedStoragePath !== finalPath || row.promotedAt === null) {
      throw new Error('restore_media_promotion_state_invalid')
    }
    if (!await destinationAlreadyMatches(admin, finalPath, row)) {
      throw new Error('restore_promoted_media_missing')
    }
    return { path: row.path, promotedStoragePath: finalPath }
  }

  if (await destinationAlreadyMatches(admin, finalPath, row)) {
    await markPromoted(admin, userId, pairId, jobId, row, finalPath)
    return { path: row.path, promotedStoragePath: finalPath }
  }

  const staged = await downloadVerified(admin, RESTORE_STAGING_BUCKET, row.storagePath, row, 'restore_staged_media')
  const { error: uploadError } = await admin.storage.from(RECIPE_MEDIA_BUCKET).upload(finalPath, staged, {
    contentType: row.mediaType,
    upsert: false,
  })
  if (uploadError) {
    // A retry or another request may have completed the exact same content-addressed
    // object between our probe and upload. Accept only an exact verified match.
    if (!await destinationAlreadyMatches(admin, finalPath, row)) {
      throw new Error('restore_media_promotion_upload_failed')
    }
  }

  await markPromoted(admin, userId, pairId, jobId, row, finalPath)
  return { path: row.path, promotedStoragePath: finalPath }
}

function mergeResult(data: unknown): RestoreMergeResult {
  const value = Array.isArray(data) ? data[0] : data
  const row = record(value, 'restore_merge_result')
  return {
    insertedCount: integer(row.inserted_count, 'restore_inserted_count'),
    noopCount: integer(row.noop_count, 'restore_noop_count'),
    conflictCount: integer(row.conflict_count, 'restore_conflict_count'),
  }
}

export async function commitRestoreMerge(
  admin: SupabaseClient,
  userId: string,
  pairId: string,
  rawJobId: unknown,
): Promise<RestoreMergeResult> {
  const jobId = uuid(rawJobId, 'restore_job_id')
  const job = await readRestoreJobSummary(admin, userId, pairId, jobId)
  if (job.mode !== 'merge' || job.status !== 'ready_to_commit') throw new Error('restore_job_not_ready_to_commit')

  const rows = await readPromotionRows(admin, userId, pairId, jobId)
  for (const row of rows) {
    const finalPath = finalRestoreMediaPath(pairId, userId, row)
    if (row.promotedAt === null || row.promotedStoragePath !== finalPath) {
      throw new Error('restore_media_not_fully_promoted')
    }
  }

  const { data, error } = await admin.rpc('commit_restore_merge_checked', {
    p_job_id: jobId,
    p_pair_id: pairId,
    p_actor_user_id: userId,
  })
  if (error) throw new Error('restore_merge_commit_failed')
  const result = mergeResult(data)

  // Staging cleanup is best-effort after a successful canonical transaction. It
  // is safe to leave temporary objects behind; they are never canonical state.
  if (rows.length > 0) {
    await admin.storage.from(RESTORE_STAGING_BUCKET).remove(rows.map((row) => row.storagePath)).catch(() => undefined)
  }
  return result
}
