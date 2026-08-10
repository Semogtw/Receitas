import type { PowerSyncDatabase } from '@powersync/web'
import { getSupabaseClient } from '../../lib/supabase/client'
import type { RecipeRepositoryScope } from '../recipes/data/recipe-repository'
import { BrowserMediaBlobCache } from './browser/media-blob-cache'
import { prepareImageForUpload } from './browser/prepare-image'
import { MediaUploadQueueStore } from './data/media-upload-queue'
import { PhotoMetadataPublisher } from './data/photo-metadata-publisher'
import { SupabaseMediaDownload } from './data/supabase-media-download'
import { SupabaseMediaStorage } from './data/supabase-media-storage'
import { MEDIA_STORAGE_BUCKET } from './media-config'
import { MediaRuntime } from './media-runtime'

export function createBrowserMediaRuntime(
  database: PowerSyncDatabase,
  scope: RecipeRepositoryScope,
): MediaRuntime {
  const client = getSupabaseClient()
  const cache = new BrowserMediaBlobCache(scope.pairId)
  const queue = new MediaUploadQueueStore(database)

  return new MediaRuntime({
    pairId: scope.pairId,
    cache,
    queue,
    storage: new SupabaseMediaStorage(client, MEDIA_STORAGE_BUCKET),
    metadata: new PhotoMetadataPublisher(database, scope),
    remote: new SupabaseMediaDownload(client, MEDIA_STORAGE_BUCKET),
    prepare: prepareImageForUpload,
  })
}
