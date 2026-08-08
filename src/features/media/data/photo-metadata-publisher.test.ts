import type { PowerSyncDatabase } from '@powersync/web'
import { describe, expect, it, vi } from 'vitest'
import type { MutationEnvelope } from '../../../data/mutations/types'
import type { MediaUploadJob } from './media-upload-queue'
import { PhotoMetadataPublisher } from './photo-metadata-publisher'

const scope = { pairId: 'pair-a', actorUserId: 'user-a' }
const recipeJob: MediaUploadJob = {
  version: 1,
  id: 'photo-a',
  pairId: scope.pairId,
  ownerType: 'recipe',
  ownerId: 'recipe-a',
  mimeType: 'image/webp',
  extension: 'webp',
  width: 1600,
  height: 1200,
  sizeBytes: 12345,
  position: 2,
  caption: 'Saindo do forno',
  createdAt: '2026-08-07T20:00:00.000Z',
  state: 'pending',
  attempts: 0,
  lastError: null,
}

function databaseWith(existing: Record<string, unknown> | null = null) {
  return {
    getOptional: vi.fn(async (sql: string) => sql.includes('mutation_outbox') ? null : existing),
  } as unknown as PowerSyncDatabase
}

function writer(envelopes: MutationEnvelope[]) {
  return vi.fn(async (_database: PowerSyncDatabase, envelope: MutationEnvelope) => {
    envelopes.push(envelope)
    return envelope.mutationId
  })
}

describe('PhotoMetadataPublisher', () => {
  it('publishes recipe photo metadata through the semantic mutation outbox only after upload', async () => {
    const envelopes: MutationEnvelope[] = []
    const publisher = new PhotoMetadataPublisher(databaseWith(), scope, writer(envelopes))

    await publisher.publish(recipeJob, 'pairs/pair-a/recipes/recipe-a/photo-a.webp')

    expect(envelopes).toHaveLength(1)
    expect(envelopes[0]).toMatchObject({
      entityType: 'recipe_photos',
      entityId: 'photo-a',
      operation: 'create',
      baseRevision: null,
      next: {
        pair_id: 'pair-a',
        revision: 0,
        recipe_id: 'recipe-a',
        storage_path: 'pairs/pair-a/recipes/recipe-a/photo-a.webp',
        position: 2,
        caption: 'Saindo do forno',
        created_by: 'user-a',
        created_at: '2026-08-07T20:00:00.000Z',
        updated_at: '2026-08-07T20:00:00.000Z',
        deleted_at: null,
      },
    })
  })

  it('publishes cooking-session photos to their distinct entity and parent field', async () => {
    const envelopes: MutationEnvelope[] = []
    const publisher = new PhotoMetadataPublisher(databaseWith(), scope, writer(envelopes))

    await publisher.publish(
      { ...recipeJob, id: 'photo-b', ownerType: 'cooking_session', ownerId: 'session-a', position: 0 },
      'pairs/pair-a/cooking-sessions/session-a/photo-b.webp',
    )

    expect(envelopes[0]).toMatchObject({
      entityType: 'cooking_session_photos',
      entityId: 'photo-b',
      next: expect.objectContaining({ cooking_session_id: 'session-a' }),
    })
    expect(envelopes[0]?.next).not.toHaveProperty('recipe_id')
  })

  it('is idempotent when the same active photo row already exists with the same remote path', async () => {
    const existing = {
      id: 'photo-a', pair_id: 'pair-a', revision: 1, recipe_id: 'recipe-a',
      storage_path: 'pairs/pair-a/recipes/recipe-a/photo-a.webp', deleted_at: null,
    }
    const envelopes: MutationEnvelope[] = []
    const publisher = new PhotoMetadataPublisher(databaseWith(existing), scope, writer(envelopes))

    await publisher.publish(recipeJob, existing.storage_path)

    expect(envelopes).toEqual([])
  })

  it('rejects a queue item from another pair instead of publishing cross-pair metadata', async () => {
    const publisher = new PhotoMetadataPublisher(databaseWith(), scope, writer([]))
    await expect(publisher.publish({ ...recipeJob, pairId: 'other-pair' }, 'path.webp')).rejects.toThrow('pair')
  })
})
