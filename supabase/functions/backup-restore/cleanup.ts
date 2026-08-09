import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.110.9'
import { RESTORE_STAGING_BUCKET } from './staging.ts'

const RECIPE_MEDIA_BUCKET = 'recipe-media'

interface CleanupCandidate {
  id: string
  pairId: string
  status: string
  stagedMedia: Array<{
    storagePath: string
    promotedStoragePath: string | null
  }>
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}_invalid`)
  return value as Record<string, unknown>
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}_invalid`)
  return value
}

function nullableText(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null
  return text(value, label)
}

function candidate(value: unknown): CleanupCandidate {
  const row = record(value, 'restore_cleanup_candidate')
  if (!Array.isArray(row.staged_media)) throw new Error('restore_cleanup_media_invalid')
  return {
    id: text(row.id, 'restore_cleanup_job_id'),
    pairId: text(row.pair_id, 'restore_cleanup_pair_id'),
    status: text(row.status, 'restore_cleanup_status'),
    stagedMedia: row.staged_media.map((item) => {
      const media = record(item, 'restore_cleanup_media')
      return {
        storagePath: text(media.storage_path, 'restore_cleanup_storage_path'),
        promotedStoragePath: nullableText(media.promoted_storage_path, 'restore_cleanup_promoted_path'),
      }
    }),
  }
}

async function storagePathReferenced(admin: SupabaseClient, path: string): Promise<boolean> {
  for (const table of ['recipe_photos', 'cooking_session_photos'] as const) {
    const { data, error } = await admin
      .from(table)
      .select('id')
      .eq('storage_path', path)
      .limit(1)
    if (error) throw new Error('restore_cleanup_reference_check_failed')
    if (Array.isArray(data) && data.length > 0) return true
  }
  return false
}

export async function cleanupUnreferencedPromotedMedia(
  admin: SupabaseClient,
  promotedPaths: readonly string[],
): Promise<number> {
  let removed = 0
  const unique = [...new Set(promotedPaths.filter(Boolean))]
  for (const path of unique) {
    if (await storagePathReferenced(admin, path)) continue
    const { error } = await admin.storage.from(RECIPE_MEDIA_BUCKET).remove([path])
    if (error) throw new Error('restore_cleanup_promoted_remove_failed')
    removed += 1
  }
  return removed
}

export async function cleanupRestoreJobs(admin: SupabaseClient, limit = 1): Promise<number> {
  const { data, error } = await admin.rpc('read_restore_cleanup_candidates', { p_limit: limit })
  if (error) throw new Error('restore_cleanup_candidates_failed')
  if (!Array.isArray(data)) throw new Error('restore_cleanup_candidates_invalid')

  let cleaned = 0
  for (const raw of data) {
    const job = candidate(raw)
    const stagedPaths = [...new Set(job.stagedMedia.map((item) => item.storagePath))]
    if (stagedPaths.length > 0) {
      const { error: removeStagedError } = await admin.storage.from(RESTORE_STAGING_BUCKET).remove(stagedPaths)
      if (removeStagedError) throw new Error('restore_cleanup_staged_remove_failed')
    }

    await cleanupUnreferencedPromotedMedia(
      admin,
      job.stagedMedia.flatMap((item) => item.promotedStoragePath ? [item.promotedStoragePath] : []),
    )

    const { data: deleted, error: deleteError } = await admin.rpc('delete_restore_cleanup_job', {
      p_job_id: job.id,
    })
    if (deleteError) throw new Error('restore_cleanup_job_delete_failed')
    if (deleted === true) cleaned += 1
  }
  return cleaned
}
