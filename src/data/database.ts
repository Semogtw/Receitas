import { PowerSyncDatabase } from '@powersync/web'
import { AppSchema } from './schema'

export interface DatabaseScope {
  userId: string
  pairId: string
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const databases = new Map<string, PowerSyncDatabase>()

function assertUuid(value: string, label: string): void {
  if (!uuidPattern.test(value)) throw new Error(`Invalid ${label} for local database scope`)
}

export function databaseNameForScope(scope: DatabaseScope): string {
  assertUuid(scope.userId, 'userId')
  assertUuid(scope.pairId, 'pairId')
  return `receitas-${scope.userId}-${scope.pairId}.db`
}

export function getDatabase(scope: DatabaseScope): PowerSyncDatabase {
  const dbFilename = databaseNameForScope(scope)
  const existing = databases.get(dbFilename)
  if (existing) return existing

  const database = new PowerSyncDatabase({
    schema: AppSchema,
    database: { dbFilename },
  })
  databases.set(dbFilename, database)
  return database
}

export function getCachedDatabase(scope: DatabaseScope): PowerSyncDatabase | null {
  return databases.get(databaseNameForScope(scope)) ?? null
}
