import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export function inspectMediaSessionIsolation({ cacheSource, factorySource, ownerPanelSource, recipePanelSource, authSource, logoutPolicySource }) {
  const findings = []

  if (!cacheSource.includes("PAIR_SCOPE_SEGMENT = 'pairs'")) {
    findings.push('browser media cache must keep an explicit pair namespace segment')
  }
  if (!cacheSource.includes('job.pairId !== this.pairId')) {
    findings.push('legacy pending-media access must validate the durable job pair')
  }
  if (cacheSource.includes('async get(mediaId') && /legacyCacheRequest[\s\S]*async get\(mediaId/.test(cacheSource)) {
    findings.push('ordinary synced-media reads must not fall back to the legacy unscoped cache')
  }

  if (!factorySource.includes('new BrowserMediaBlobCache(scope.pairId)')) {
    findings.push('browser media runtime must construct cache with scope.pairId')
  }
  if (!factorySource.includes('pairId: scope.pairId')) {
    findings.push('MediaRuntime must receive the authenticated pair scope')
  }

  if (ownerPanelSource.includes('new BrowserMediaBlobCache(') || !ownerPanelSource.includes('runtime.getPendingBlob(job)')) {
    findings.push('pending photo previews must go through the scoped MediaRuntime')
  }
  if (recipePanelSource.includes('new BrowserMediaBlobCache(')) {
    findings.push('recipe photo UI must not bypass the scoped MediaRuntime cache')
  }

  if (!authSource.includes('prepareLocalStateForLogout(database)')) {
    findings.push('logout must inspect recoverable local work before ending the session')
  }
  if (!logoutPolicySource.includes("'media_upload_queue_v1'")) {
    findings.push('logout protection must inspect the durable media upload queue')
  }
  if (logoutPolicySource.includes("storage_state IN ('local_only'")) {
    findings.push('logout protection must not infer pending uploads from synced photo metadata states')
  }

  return findings
}

export async function auditMediaSessionIsolation(root = process.cwd()) {
  const paths = {
    cacheSource: ['src', 'features', 'media', 'browser', 'media-blob-cache.ts'],
    factorySource: ['src', 'features', 'media', 'create-browser-media-runtime.ts'],
    ownerPanelSource: ['src', 'features', 'media', 'components', 'OwnerPhotosPanel.tsx'],
    recipePanelSource: ['src', 'features', 'media', 'components', 'RecipePhotosPanel.tsx'],
    authSource: ['src', 'features', 'auth', 'AuthProvider.tsx'],
    logoutPolicySource: ['src', 'data', 'session', 'local-session-policy.ts'],
  }

  const entries = await Promise.all(Object.entries(paths).map(async ([key, parts]) => [
    key,
    await readFile(join(root, ...parts), 'utf8').catch(() => ''),
  ]))
  return inspectMediaSessionIsolation(Object.fromEntries(entries))
}

export async function runMediaSessionIsolationAudit(root = process.cwd()) {
  const findings = await auditMediaSessionIsolation(root)
  if (findings.length > 0) throw new Error(`Media session isolation audit failed:\n- ${findings.join('\n- ')}`)
  return { ok: true }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  runMediaSessionIsolationAudit()
    .then(() => console.log('Media session isolation audit passed.'))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
