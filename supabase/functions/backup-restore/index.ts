import { readJsonObject, withCorsAndErrors } from '../_shared/http.ts'
import { createServerClient, getRequestUserId } from '../_shared/server.ts'
import {
  commitRestoreMerge,
  listRestoreMediaPromotion,
  promoteRestoreMedia,
} from './commit.ts'
import { finalizeRestoreStagingStrict } from './finalize.ts'
import {
  activePairForUser,
  confirmRestoreMedia,
  createRestoreJob,
  prepareRestoreMediaUpload,
  readRestoreJobSummary,
  stageRestoreDataBatch,
} from './staging.ts'

const MAX_REQUEST_BYTES = 3 * 1024 * 1024

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function publicError(error: unknown): Response {
  const code = error instanceof Error ? error.message : 'restore_request_failed'

  if (code === 'restore_membership_required') return json(403, { error: 'pair_membership_required' })
  if (code === 'restore_membership_unavailable') return json(503, { error: 'membership_check_unavailable' })
  if (code === 'restore_job_read_failed') return json(404, { error: 'restore_job_not_found' })

  if (
    code.includes('not_uploading')
    || code.includes('expired')
    || code.includes('already_confirmed')
    || code.includes('not_validating')
    || code.includes('not_ready')
    || code.includes('not_fully_promoted')
    || code.includes('promotion_state')
  ) {
    return json(409, { error: 'restore_job_state_conflict' })
  }

  if (
    code.includes('checksum')
    || code.includes('descriptor')
    || code.includes('manifest')
    || code.includes('reference')
    || code.includes('batch')
    || code.includes('file_')
    || code.includes('media_')
    || code.includes('photo_')
    || code.includes('pair_scope')
    || code.includes('forbidden_restore_field')
    || code.includes('unsupported_restore_format')
  ) {
    return json(422, { error: 'restore_validation_failed' })
  }

  if (
    code.includes('_invalid')
    || code.includes('_must_be_')
    || code.includes('_not_allowed')
    || code.includes('unsafe_restore_path')
  ) {
    return json(400, { error: 'invalid_restore_request' })
  }

  if (
    code.includes('_failed')
    || code.includes('_unavailable')
  ) {
    return json(503, { error: 'restore_service_unavailable' })
  }

  return json(422, { error: 'restore_request_rejected' })
}

const handler = async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  let body: Record<string, unknown>
  try {
    body = await readJsonObject(request, MAX_REQUEST_BYTES)
  } catch (error) {
    if (error instanceof Error && error.message === 'request_body_too_large') {
      return json(413, { error: 'request_body_too_large' })
    }
    return json(400, { error: 'invalid_request' })
  }
  const action = typeof body.action === 'string' ? body.action : ''

  const admin = createServerClient()
  const userId = await getRequestUserId(admin, request)
  const pairId = await activePairForUser(admin, userId)

  try {
    switch (action) {
      case 'create_job': {
        const job = await createRestoreJob(admin, userId, pairId, {
          mode: body.mode,
          manifest: body.manifest,
        })
        return json(201, { job })
      }
      case 'stage_data': {
        await stageRestoreDataBatch(admin, userId, pairId, body)
        return json(200, { ok: true })
      }
      case 'prepare_media_upload': {
        const upload = await prepareRestoreMediaUpload(admin, userId, pairId, body)
        return json(200, { upload })
      }
      case 'confirm_media': {
        await confirmRestoreMedia(admin, userId, pairId, body)
        return json(200, { ok: true })
      }
      case 'finalize_staging': {
        const job = await finalizeRestoreStagingStrict(admin, userId, pairId, body.jobId)
        return json(200, { job })
      }
      case 'list_media_promotion': {
        const media = await listRestoreMediaPromotion(admin, userId, pairId, body.jobId)
        return json(200, { media })
      }
      case 'promote_media': {
        const promotion = await promoteRestoreMedia(admin, userId, pairId, {
          jobId: body.jobId,
          path: body.path,
        })
        return json(200, { promotion })
      }
      case 'commit_merge': {
        const result = await commitRestoreMerge(admin, userId, pairId, body.jobId)
        return json(200, { result })
      }
      case 'get_job': {
        const job = await readRestoreJobSummary(admin, userId, pairId, body.jobId)
        return json(200, { job })
      }
      default:
        return json(400, { error: 'unsupported_action' })
    }
  } catch (error) {
    return publicError(error)
  }
}

export function createBackupRestoreHandler() {
  return withCorsAndErrors(handler)
}

if (import.meta.main) Deno.serve(createBackupRestoreHandler())
