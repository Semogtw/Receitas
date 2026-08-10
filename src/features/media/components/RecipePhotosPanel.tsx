import type { PowerSyncDatabase } from '@powersync/web'
import type { MediaRuntime } from '../media-runtime'
import { OwnerPhotosPanel } from './OwnerPhotosPanel'

interface RecipePhotosPanelProps {
  database: PowerSyncDatabase
  pairId: string
  actorUserId: string
  recipeId: string
  runtime: MediaRuntime
}

export function RecipePhotosPanel({
  database,
  pairId,
  actorUserId,
  recipeId,
  runtime,
}: RecipePhotosPanelProps) {
  return (
    <OwnerPhotosPanel
      database={database}
      pairId={pairId}
      actorUserId={actorUserId}
      ownerType="recipe"
      ownerId={recipeId}
      runtime={runtime}
      kicker="Fotos"
      title="Como ficou"
      emptyText="Nenhuma foto adicionada ainda."
    />
  )
}
