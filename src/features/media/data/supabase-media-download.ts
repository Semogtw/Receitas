interface StorageDownloadResult {
  data: Blob | null
  error: { message?: string } | null
}

interface StorageBucketLike {
  download(path: string): Promise<StorageDownloadResult>
}

interface SupabaseStorageLike {
  storage: {
    from(bucket: string): StorageBucketLike
  }
}

export class SupabaseMediaDownload {
  private readonly bucket: string

  constructor(
    private readonly client: SupabaseStorageLike,
    bucket: string,
  ) {
    const normalized = bucket.trim()
    if (!normalized) throw new Error('Media storage bucket is required')
    this.bucket = normalized
  }

  async download(path: string): Promise<Blob> {
    if (!path.trim()) throw new Error('Media storage path is required')
    const { data, error } = await this.client.storage.from(this.bucket).download(path)
    if (error) throw new Error(error.message?.trim() || 'Supabase media download failed')
    if (!data) throw new Error('Supabase media download returned no binary data')
    return data
  }
}
