import type { PreparedImage } from './browser/prepare-image'
import { enqueuePreparedPhoto } from './data/enqueue-prepared-photo'
import type { MediaUploadJob, MediaUploadOwnerType } from './data/media-upload-queue'
import { MediaUploadRunner, type MediaUploadDrainResult } from './data/media-upload-runner'
import { processNextMediaUpload } from './data/process-media-upload'
import { resolveMediaBlob } from './data/resolve-media-blob'

interface MediaRuntimeCache {
  put(mediaId: string, blob: Blob): Promise<void>
  get(mediaId: string): Promise<Blob | null>
  delete(mediaId: string): Promise<boolean>
}

interface MediaRuntimeQueue {
  enqueue(job: MediaUploadJob): Promise<void>
  load(): Promise<MediaUploadJob[]>
  markUploading(id: string): Promise<void>
  markFailed(id: string, error: string): Promise<void>
  retry(id: string): Promise<void>
  remove(id: string): Promise<void>
}

interface MediaRuntimeStorage {
  upload(path: string, blob: Blob, mimeType: MediaUploadJob['mimeType']): Promise<void>
}

interface MediaRuntimeMetadata {
  publish(job: MediaUploadJob, storagePath: string): Promise<void>
}

interface MediaRuntimeRemote {
  download(storagePath: string): Promise<Blob>
}

export interface QueuePhotoInput {
  file: Blob
  pairId: string
  ownerType: MediaUploadOwnerType
  ownerId: string
  position: number
  caption?: string | null
  mediaId?: string
}

export class MediaRuntime {
  private readonly runner: MediaUploadRunner

  constructor(private readonly dependencies: {
    cache: MediaRuntimeCache
    queue: MediaRuntimeQueue
    storage: MediaRuntimeStorage
    metadata: MediaRuntimeMetadata
    remote: MediaRuntimeRemote
    prepare(file: Blob): Promise<PreparedImage>
  }) {
    this.runner = new MediaUploadRunner(() => processNextMediaUpload({
      queue: dependencies.queue,
      blobs: dependencies.cache,
      storage: dependencies.storage,
      metadata: dependencies.metadata,
    }))
  }

  async queuePhoto(input: QueuePhotoInput): Promise<MediaUploadJob> {
    return enqueuePreparedPhoto({
      ...input,
      prepare: this.dependencies.prepare,
      cache: this.dependencies.cache,
      queue: this.dependencies.queue,
    })
  }

  async listUploads(): Promise<MediaUploadJob[]> {
    return this.dependencies.queue.load()
  }

  async drainUploads(): Promise<MediaUploadDrainResult> {
    return this.runner.drain()
  }

  async retryUpload(mediaId: string): Promise<MediaUploadDrainResult> {
    await this.dependencies.queue.retry(mediaId)
    return this.runner.drain()
  }

  async resolveBlob(mediaId: string, storagePath: string): Promise<Blob> {
    return resolveMediaBlob(mediaId, storagePath, {
      cache: this.dependencies.cache,
      remote: this.dependencies.remote,
    })
  }
}
