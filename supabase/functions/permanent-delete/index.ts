import { jsonResponse, readJsonObject, withCorsAndErrors } from '../_shared/http.ts'
import { getAdminClient, getRequestUserId } from '../_shared/server.ts'

const MEDIA_BUCKET = 'recipe-media'
const MEDIA_DELETE_FAILURE_CODE = 'storage_delete_failed'
const ALLOWED_ENTITY_TYPES = new Set([
  'recipes',
  'recipe_ingredients',
  'recipe_steps',
  'categories',
  'recipe_categories',
  'recipe_photos',
  'cooking_sessions',
  'cooking_session_ratings',
  'cooking_session_photos',
  'ingredient_conversion_profiles',
  'imports',
  'meal_periods',
  'meal_plan_entries',
  'shopping_lists',
  'shopping_items',
])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type ServerClient = ReturnType<typeof getAdminClient>

interface PermanentDeleteDependencies {
  getClient?: () => ServerClient
  getUserId?: (client: ServerClient, request: Request) => Promise<string>
}

function requiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key]
  if (typeof value !== 'string' || !value.trim()) throw new Error(`invalid_${key}`)
  return value.trim()
}

export function parsePermanentDeleteRequest(body: Record<string, unknown>): {
  entityType: string
  entityId: string
} {
  const entityType = requiredString(body, 'entityType')
  const entityId = requiredString(body, 'entityId')
  if (!ALLOWED_ENTITY_TYPES.has(entityType)) throw new Error('invalid_entity_type')
  if (!UUID_PATTERN.test(entityId)) throw new Error('invalid_entity_id')
  return { entityType, entityId }
}

async function activePairId(client: ServerClient, userId: string): Promise<string> {
  const { data, error } = await client
    .from('pair_members')
    .select('pair_id')
    .eq('user_id', userId)
    .is('removed_at', null)
    .not('activated_at', 'is', null)
    .limit(2)

  if (error) throw new Error('pair_lookup_failed')
  if (!data || data.length !== 1 || typeof data[0]?.pair_id !== 'string') {
    throw new Error('active_pair_required')
  }
  return data[0].pair_id
}

async function readCleanupQueue(client: ServerClient, pairId: string, limit: number) {
  const { data, error } = await client.rpc('read_media_delete_queue_server', {
    p_pair_id: pairId,
    p_limit: limit,
  })
  if (error) throw new Error('media_delete_queue_read_failed')
  return Array.isArray(data) ? data : []
}

async function markCleanupFailure(
  client: ServerClient,
  pairId: string,
  storagePath: string,
): Promise<void> {
  const { error } = await client.rpc('mark_media_delete_failed_server', {
    p_pair_id: pairId,
    p_storage_path: storagePath,
    p_error: MEDIA_DELETE_FAILURE_CODE,
  })
  if (error) console.error('media_delete_queue_mark_failed')
}

export async function cleanupPendingMediaDeletes(
  client: ServerClient,
  pairId: string,
): Promise<{ attempted: number; remaining: number }> {
  const rows = await readCleanupQueue(client, pairId, 20)

  for (const row of rows) {
    const storagePath = row && typeof row === 'object' && typeof row.storage_path === 'string'
      ? row.storage_path
      : null
    if (!storagePath) continue

    const removal = await client.storage.from(MEDIA_BUCKET).remove([storagePath])
    if (removal.error) {
      // Provider messages can include implementation details. Persist only a
      // stable retryable code; the queue already records the affected path.
      await markCleanupFailure(client, pairId, storagePath)
      continue
    }

    const { error: markError } = await client.rpc('mark_media_delete_complete_server', {
      p_pair_id: pairId,
      p_storage_path: storagePath,
    })
    if (markError) throw new Error('media_delete_queue_complete_failed')
  }

  // Do not expose paths/counts from the private queue. A second bounded read is
  // enough to tell the client whether another retry is still useful, including
  // the case where more than one batch was queued.
  const remainingRows = await readCleanupQueue(client, pairId, 1)
  return { attempted: rows.length, remaining: remainingRows.length > 0 ? 1 : 0 }
}

function knownErrorStatus(message: string): number | null {
  if (message === 'active_pair_required') return 403
  if (message === 'request_body_too_large') return 413
  if (message === 'invalid_entity_type' || message === 'invalid_entity_id' || message.startsWith('invalid_')) return 400
  if (message.includes('must exist in this pair') || message.includes('entity must exist')) return 404
  return null
}

export function createPermanentDeleteHandler(dependencies: PermanentDeleteDependencies = {}) {
  const getClient = dependencies.getClient ?? getAdminClient
  const getUserId = dependencies.getUserId ?? getRequestUserId

  return withCorsAndErrors(async (request) => {
    if (request.method !== 'POST') return jsonResponse(request, { error: 'method_not_allowed' }, 405)

    try {
      // Invalid public input should fail before allocating the privileged client
      // or spending an authenticated-user lookup.
      const body = await readJsonObject(request)
      const client = getClient()
      const userId = await getUserId(client, request)
      const pairId = await activePairId(client, userId)

      if (body.action === 'cleanup') {
        const cleanup = await cleanupPendingMediaDeletes(client, pairId)
        return jsonResponse(request, { ok: true, cleanupPending: cleanup.remaining > 0 })
      }

      const { entityType, entityId } = parsePermanentDeleteRequest(body)
      const { error } = await client.rpc('permanently_delete_entity_server', {
        p_actor_user_id: userId,
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_pair_id: pairId,
      })
      if (error) {
        const message = error.message?.trim() || 'permanent_delete_failed'
        const status = knownErrorStatus(message)
        if (status) return jsonResponse(request, { error: status === 404 ? 'not_found' : message }, status)
        throw new Error('permanent_delete_failed')
      }

      // Storage is external to the Postgres transaction. The RPC enqueues the
      // path before deleting media metadata, so a failed removal stays retryable
      // without risking resurrection or silent loss of canonical rows.
      const cleanup = await cleanupPendingMediaDeletes(client, pairId).catch(() => ({ attempted: 0, remaining: 1 }))
      return jsonResponse(request, {
        ok: true,
        cleanupPending: cleanup.remaining > 0,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid_request'
      const status = knownErrorStatus(message)
      if (status) return jsonResponse(request, { error: message }, status)
      throw error
    }
  })
}

const handler = createPermanentDeleteHandler()
if (import.meta.main) Deno.serve(handler)
