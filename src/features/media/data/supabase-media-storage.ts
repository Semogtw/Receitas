interface StorageUploadResult {
  data: unknown
  error: { message?: string } | null
}

interface StorageBucketLike {
  upload(
    path: string,
    body: Blob,
    options: { contentType: string; upsert: boolean; cacheControl: string },
  ): Promise<StorageUploadResult>
}

interface SupabaseStorageLike {
  storage: {
    from(bucket: string): StorageBucketLike
  }
}

export class SupabaseMediaStorage {
  private readonly bucket: string

  constructor(
    private readonly client: SupabaseStorageLike,
    bucket: string,
  ) {
    const normalized = bucket.trim()
    if (!normalized) throw new Error('Media storage bucket is required')
    this.bucket = normalized
  }

  async upload(path: string, blob: Blob, mimeType: 'image/webp' | 'image/jpeg'): Promise<void> {
    if (!path.trim()) throw new Error('Media storage path is required')
    const { error } = await this.client.storage.from(this.bucket).upload(path, blob, {
      contentType: mimeType,
      upsert: true,
      cacheControl: '31536000',
    })
    if (error) throw new Error(error.message?.trim() || 'Supabase media upload failed')
  }
}
