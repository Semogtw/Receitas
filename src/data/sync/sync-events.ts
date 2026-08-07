export const SYNC_QUEUE_CHANGED_EVENT = 'receitas:sync-queue-changed'

export function notifySyncQueueChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(SYNC_QUEUE_CHANGED_EVENT))
}
