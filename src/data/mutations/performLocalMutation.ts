import type { PowerSyncDatabase } from '@powersync/web'
import { notifySyncQueueChanged } from '../sync/sync-events'
import { applyLocalMutation } from './applyLocalMutation'
import type { MutationEnvelope } from './types'

export async function performLocalMutation(
  database: PowerSyncDatabase,
  envelope: MutationEnvelope,
): Promise<string> {
  const mutationId = await applyLocalMutation(database, envelope)
  notifySyncQueueChanged()
  return mutationId
}
