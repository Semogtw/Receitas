const MEDIA_CACHE_NAME = 'receitas-media-v1'
const MEDIA_CACHE_PREFIX = '/__receitas_media/'
const PAIR_SCOPE_SEGMENT = 'pairs'

interface MediaCacheLike {
  put(request: Request, response: Response): Promise<void>
  match(request: Request): Promise<Response | undefined>
  delete(request: Request): Promise<boolean>
}

export interface MediaCacheRuntime {
  origin: string
  open(name: string): Promise<MediaCacheLike>
}

interface PendingMediaIdentity {
  id: string
  pairId: string
}

const browserRuntime: MediaCacheRuntime = {
  get origin() {
    if (typeof window === 'undefined') throw new Error('Media cache requires a browser window')
    return window.location.origin
  },
  async open(name) {
    if (typeof caches === 'undefined') throw new Error('Cache Storage is unavailable in this browser')
    return caches.open(name)
  },
}

function assertNonEmpty(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${label} is required`)
  return trimmed
}

function scopedCacheRequest(origin: string, pairId: string, mediaId: string): Request {
  return new Request(
    `${origin}${MEDIA_CACHE_PREFIX}${PAIR_SCOPE_SEGMENT}/${encodeURIComponent(pairId)}/${encodeURIComponent(mediaId)}`,
    { method: 'GET' },
  )
}

function legacyCacheRequest(origin: string, mediaId: string): Request {
  return new Request(`${origin}${MEDIA_CACHE_PREFIX}${encodeURIComponent(mediaId)}`, { method: 'GET' })
}

export class BrowserMediaBlobCache {
  private readonly pairId: string

  constructor(pairId: string, private readonly runtime: MediaCacheRuntime = browserRuntime) {
    this.pairId = assertNonEmpty(pairId, 'Media cache pair scope')
  }

  private request(mediaId: string): Request {
    return scopedCacheRequest(this.runtime.origin, this.pairId, assertNonEmpty(mediaId, 'Media id'))
  }

  async put(mediaId: string, blob: Blob): Promise<void> {
    const cache = await this.runtime.open(MEDIA_CACHE_NAME)
    await cache.put(
      this.request(mediaId),
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
    const response = await cache.match(this.request(mediaId))
    if (!response) return null
    return response.blob()
  }

  async getForUpload(job: PendingMediaIdentity): Promise<Blob | null> {
    if (job.pairId !== this.pairId) {
      throw new Error('Media upload job does not belong to the active cache scope')
    }

    const scoped = await this.get(job.id)
    if (scoped) return scoped

    // Compatibility boundary for photos prepared by releases that predate
    // pair-scoped cache keys. Only a durable upload job from this exact pair is
    // allowed to claim a legacy blob; ordinary synced-media reads never fall
    // back to this namespace.
    const cache = await this.runtime.open(MEDIA_CACHE_NAME)
    const legacyRequest = legacyCacheRequest(this.runtime.origin, assertNonEmpty(job.id, 'Media id'))
    const legacyResponse = await cache.match(legacyRequest)
    if (!legacyResponse) return null

    const blob = await legacyResponse.blob()
    await this.put(job.id, blob)
    await cache.delete(legacyRequest)
    return blob
  }

  async delete(mediaId: string): Promise<boolean> {
    if (!mediaId.trim()) return false
    const cache = await this.runtime.open(MEDIA_CACHE_NAME)
    return cache.delete(this.request(mediaId))
  }
}
