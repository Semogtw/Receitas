interface MediaBlobCache {
  get(mediaId: string): Promise<Blob | null>
  put(mediaId: string, blob: Blob): Promise<void>
}

interface RemoteMediaDownloader {
  download(storagePath: string): Promise<Blob>
}

export async function resolveMediaBlob(
  mediaId: string,
  storagePath: string,
  dependencies: { cache: MediaBlobCache; remote: RemoteMediaDownloader },
): Promise<Blob> {
  const cached = await dependencies.cache.get(mediaId)
  if (cached) return cached

  const downloaded = await dependencies.remote.download(storagePath)
  await dependencies.cache.put(mediaId, downloaded)
  return downloaded
}
