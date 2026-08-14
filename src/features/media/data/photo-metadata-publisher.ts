import type { PowerSyncDatabase } from '@powersync/web'
import { performLocalMutation } from '../../../data/mutations/performLocalMutation'
import { createMutationEnvelope, type MutationEnvelope } from '../../../data/mutations/types'
import type { RecipeRepositoryScope } from '../../recipes/data/recipe-repository'
import { buildMediaStoragePath } from '../domain/storage-path'
import type { MediaUploadJob } from './media-upload-queue'

type MutationWriter = (database: PowerSyncDatabase, envelope: MutationEnvelope) => Promise<string>

interface ExistingPhotoRow {
  id: string
  storage_path?: unknown
  deleted_at?: unknown
}

function cleanPath(value: string): string {
  const path = value.trim()
  if (!path) throw new Error('Media storage path is required')
  return path
}

export class PhotoMetadataPublisher {
  constructor(
    private readonly database: PowerSyncDatabase,
    private readonly scope: RecipeRepositoryScope,
    private readonly writeMutation: MutationWriter = performLocalMutation,
  ) {}

  async publish(job: MediaUploadJob, storagePathInput: string): Promise<void> {
    if (job.pairId !== this.scope.pairId) {
      throw new Error('Media upload job does not belong to the active pair')
    }

    const storagePath = cleanPath(storagePathInput)
    if (storagePath !== buildMediaStoragePath(job)) {
      throw new Error('Media metadata storage path does not match the upload job')
    }

    const entityType = job.ownerType === 'recipe' ? 'recipe_photos' : 'cooking_session_photos'
    const parentField = job.ownerType === 'recipe' ? 'recipe_id' : 'cooking_session_id'

    const existing = await this.database.getOptional<ExistingPhotoRow>(
      `SELECT id, storage_path, deleted_at FROM ${entityType} WHERE id = ? AND pair_id = ? LIMIT 1`,
      [job.id, this.scope.pairId],
    )

    if (existing && existing.deleted_at == null && existing.storage_path === storagePath) return
    if (existing) {
      throw new Error('Photo metadata id already exists with different state; resolve it before retrying upload')
    }

    await this.writeMutation(this.database, createMutationEnvelope({
      pairId: this.scope.pairId,
      actorUserId: this.scope.actorUserId,
      entityType,
      entityId: job.id,
      operation: 'create',
      baseRevision: null,
      base: null,
      next: {
        pair_id: this.scope.pairId,
        revision: 0,
        [parentField]: job.ownerId,
        storage_path: storagePath,
        storage_state: 'uploaded',
        mime_type: job.mimeType,
        byte_size: job.sizeBytes,
        width: job.width,
        height: job.height,
        sha256: job.sha256 ?? null,
        position: job.position,
        ...(job.ownerType === 'recipe' ? { is_cover: false } : {}),
        caption: job.caption,
        created_by: this.scope.actorUserId,
        created_at: job.createdAt,
        updated_at: job.createdAt,
        deleted_at: null,
      },
    }))
  }
}
