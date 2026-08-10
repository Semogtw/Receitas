interface StorageUploadResult {
  data: unknown
  error: { message?: string } | null
}

interface StorageDownloadResult {
  data: Blob | null
  error: { message?: string } | null
}

interface StorageBucketLike {
  upload(
    path: string,
    body: Blob,
    options: { contentType: string; upsert: boolean; cacheControl: string },
  ): Promise<StorageUploadResult>
  download(path: string): Promise<StorageDownloadResult>
}

interface SupabaseStorageLike {
  storage: {
    from(bucket: string): StorageBucketLike
  }
}

async function blobsAreIdentical(actual: Blob, expected: Blob, mimeType: string): Promise<boolean> {
  if (actual.size !== expected.size) return false
  if (actual.type && actual.type !== mimeType) return false

  const [actualBytes, expectedBytes] = await Promise.all([
    actual.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
    expected.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
  ])
  if (actualBytes.byteLength !== expectedBytes.byteLength) return false
  for (let index = 0; index < actualBytes.byteLength; index += 1) {
    if (actualBytes[index] !== expectedBytes[index]) return false
  }
  return true
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
    const bucket = this.client.storage.from(this.bucket)
    const { error } = await bucket.upload(path, blob, {
      contentType: mimeType,
      upsert: false,
      cacheControl: '31536000',
    })
    if (!error) return

    // A successful upload may race with a lost/failed response. Retrying with
    // upsert would require UPDATE permission and could overwrite an existing
    // private photo. Instead, accept an existing object only when it is exactly
    // the same bytes and MIME type as the prepared local blob.
    const existing = await bucket.download(path)
    if (existing.data && !existing.error && await blobsAreIdentical(existing.data, blob, mimeType)) return

    throw new Error(error.message?.trim() || 'Supabase media upload failed')
  }
}
