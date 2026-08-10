import assert from 'node:assert/strict'
import test from 'node:test'

import { inspectMediaSessionIsolation } from './media-session-isolation-audit.mjs'

const SAFE = {
  cacheSource: `
const PAIR_SCOPE_SEGMENT = 'pairs'
class BrowserMediaBlobCache {
  async get(mediaId: string): Promise<Blob | null> {
    const response = await cache.match(this.request(mediaId))
    return response ? response.blob() : null
  }

  async getForUpload(job: { id: string; pairId: string }) {
    if (job.pairId !== this.pairId) throw new Error('scope')
    return legacyCacheRequest(this.runtime.origin, job.id)
  }
}
`,
  factorySource: `
const cache = new BrowserMediaBlobCache(scope.pairId)
return new MediaRuntime({ pairId: scope.pairId, cache })
`,
  ownerPanelSource: `
<BlobImage load={() => runtime.getPendingBlob(job)} />
`,
  recipePanelSource: '<OwnerPhotosPanel runtime={runtime} />',
  authSource: 'await prepareLocalStateForLogout(database)',
  logoutPolicySource: "getOptional('device_preferences', ['media_upload_queue_v1'])",
}

test('accepts pair-scoped cache and fail-safe logout preservation wiring', () => {
  assert.deepEqual(inspectMediaSessionIsolation(SAFE), [])
})

test('rejects ordinary synced-media legacy fallback and cross-pair-agnostic pending reads', () => {
  const findings = inspectMediaSessionIsolation({
    ...SAFE,
    cacheSource: `
const PAIR_SCOPE_SEGMENT = 'pairs'
class BrowserMediaBlobCache {
  async get(mediaId: string): Promise<Blob | null> {
    return cache.match(legacyCacheRequest(origin, mediaId))
  }

  async getForUpload(job: { id: string; pairId: string }) {
    return cache.match(legacyCacheRequest(origin, job.id))
  }
}
`,
  })
  assert(findings.some((finding) => finding.includes('legacy pending-media access')))
  assert(findings.some((finding) => finding.includes('ordinary synced-media reads')))
})

test('rejects a factory or component that bypasses pair-scoped runtime cache', () => {
  const findings = inspectMediaSessionIsolation({
    ...SAFE,
    factorySource: 'const cache = new BrowserMediaBlobCache()',
    ownerPanelSource: 'const cache = new BrowserMediaBlobCache(); cache.get(job.id)',
  })
  assert(findings.some((finding) => finding.includes('scope.pairId')))
  assert(findings.some((finding) => finding.includes('pending photo previews')))
})

test('rejects logout protection that ignores the durable upload queue', () => {
  const findings = inspectMediaSessionIsolation({
    ...SAFE,
    logoutPolicySource: "storage_state IN ('local_only', 'upload_pending', 'uploading', 'failed')",
  })
  assert(findings.some((finding) => finding.includes('durable media upload queue')))
  assert(findings.some((finding) => finding.includes('synced photo metadata states')))
})
