import type { PowerSyncDatabase } from '@powersync/web'
import type { DiagnosticEventInput } from './events'
import { DiagnosticStore } from './store'

export async function recordDiagnosticSafely(
  database: PowerSyncDatabase,
  input: DiagnosticEventInput,
): Promise<void> {
  try {
    await new DiagnosticStore(database).append(input)
  } catch {
    // Diagnostics are deliberately best-effort. A local logging failure must
    // never block cooking, import, sync, backup or authentication workflows.
  }
}
