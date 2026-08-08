import type { PowerSyncDatabase } from '@powersync/web'
import type { MediaRuntime } from '../media-runtime'
import { OwnerPhotosPanel } from './OwnerPhotosPanel'

interface CookingSessionPhotosPanelProps {
  database: PowerSyncDatabase
  pairId: string
  actorUserId: string
  sessionId: string
  runtime: MediaRuntime
}

export function CookingSessionPhotosPanel({
  database,
  pairId,
  actorUserId,
  sessionId,
  runtime,
}: CookingSessionPhotosPanelProps) {
  return (
    <OwnerPhotosPanel
      database={database}
      pairId={pairId}
      actorUserId={actorUserId}
      ownerType="cooking_session"
      ownerId={sessionId}
      runtime={runtime}
      kicker="Fotos do preparo"
      title="Registro visual"
      emptyText="Nenhuma foto adicionada a este preparo ainda."
    />
  )
}
