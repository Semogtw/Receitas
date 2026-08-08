const MEDIA_CACHE_NAME = 'receitas-media-v1'
const MEDIA_CACHE_PREFIX = '/__receitas_media/'

interface MediaCacheLike {
  put(request: Request, response: Response): Promise<void>
  match(request: Request): Promise<Response | undefined>
  delete(request: Request): Promise<boolean>
}

export interface MediaCacheRuntime {
  origin: string
  open(name: string): Promise<MediaCacheLike>
}

const browserRuntime: MediaCacheRuntime = {
  get origin() {
    if (typeof window === 'undefined') throw new Error('Media cache requires a browser window')
    return window.location.origin
  },
  async open(name: string) {
    if (typeof caches === 'undefined') throw new Error('Cache Storage is unavailable in this browser')
    return caches.open(name)
  },
}

function cacheRequest(origin: string, mediaId: string): Request {
  const encodedId = encodeURIComponent(mediaId)
  return new Request(`${origin}${MEDIA_CACHE_PREFIX}${encodedId}`, { method: 'GET' })
}

export class BrowserMediaBlobCache {
  constructor(private readonly runtime: MediaCacheRuntime = browserRuntime) {}

  async put(mediaId: string, blob: Blob): Promise<void> {
    if (!mediaId.trim()) throw new Error('Media id is required')
    const cache = await this.runtime.open(MEDIA_CACHE_NAME)
    await cache.put(
      cacheRequest(this.runtime.origin, mediaId),
      new Response(blob, {
        headers: {
          'Content-Type': blob.type || 'application/octet-stream',
          'Cache-Control': 'private, max-age=31536000, immutable',
        },
      }),
    )
  }

  async get(mediaId: string): Promise<Blob | null> {
    if (!mediaId.trim()) return null
    const cache = await this.runtime.open(MEDIA_CACHE_NAME)
    const response = await cache.match(cacheRequest(this.runtime.origin, mediaId))
    if (!response) return null
    return response.blob()
  }

  async delete(mediaId: string): Promise<boolean> {
    if (!mediaId.trim()) return false
    const cache = await this.runtime.open(MEDIA_CACHE_NAME)
    return cache.delete(cacheRequest(this.runtime.origin, mediaId))
  }
}
