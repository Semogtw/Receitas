import type { MediaUploadJob } from './media-upload-queue'
import { buildMediaStoragePath } from '../domain/storage-path'

interface MediaUploadQueue {
  load(): Promise<MediaUploadJob[]>
  markUploading(id: string): Promise<void>
  markFailed(id: string, error: string): Promise<void>
  remove(id: string): Promise<void>
}

interface MediaBlobReader {
  get(mediaId: string): Promise<Blob | null>
}

interface MediaStorageGateway {
  upload(path: string, blob: Blob, mimeType: MediaUploadJob['mimeType']): Promise<void>
}

interface MediaMetadataPublisher {
  publish(job: MediaUploadJob, storagePath: string): Promise<void>
}

export type MediaUploadProcessResult =
  | { status: 'idle' }
  | { status: 'uploaded'; mediaId: string }
  | { status: 'failed'; mediaId: string }

function errorMessage(cause: unknown): string {
  if (cause instanceof Error && cause.message.trim()) return cause.message.trim()
  return 'Media upload failed'
}

export async function processNextMediaUpload(input: {
  queue: MediaUploadQueue
  blobs: MediaBlobReader
  storage: MediaStorageGateway
  metadata: MediaMetadataPublisher
}): Promise<MediaUploadProcessResult> {
  const jobs = await input.queue.load()
  const job = jobs.find((candidate) => candidate.state === 'pending')
  if (!job) return { status: 'idle' }

  await input.queue.markUploading(job.id)

  try {
    const blob = await input.blobs.get(job.id)
    if (!blob) throw new Error('Prepared media is no longer cached on this device')

    const storagePath = buildMediaStoragePath({
      pairId: job.pairId,
      ownerType: job.ownerType,
      ownerId: job.ownerId,
      mediaId: job.id,
      extension: job.extension,
    })

    await input.storage.upload(storagePath, blob, job.mimeType)
    await input.metadata.publish(job, storagePath)
    await input.queue.remove(job.id)
    return { status: 'uploaded', mediaId: job.id }
  } catch (cause) {
    await input.queue.markFailed(job.id, errorMessage(cause))
    return { status: 'failed', mediaId: job.id }
  }
}
