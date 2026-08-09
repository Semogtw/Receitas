import type { PowerSyncDatabase } from '@powersync/web'
import type { BackupArtifact } from '../backup/domain/complete-backup-format'
import { createCompleteBackup, type CompleteBackupMediaDownloader, type CompleteBackupProgress } from '../backup/data/complete-backup-service'
import { RestoreStagingService, type RestoreJobSummary, type RestoreStagingProgress } from '../backup/data/restore-staging-service'

export interface AccountAdminStatus {
  otherMember: { userId: string; email: string | null } | null
  pendingReplacement: {
    actionId: string
    replacementUserId: string | null
    replacementEmail: string | null
    expiresAt: string
    authCleanupPending: boolean
  } | null
  authCleanupPending: boolean
}

export interface AccountAdminSafety {
  artifact: BackupArtifact
  job: RestoreJobSummary
}

export type AccountAdminSafetyProgress =
  | { stage: 'backup'; progress: CompleteBackupProgress }
  | { stage: 'staging'; progress: RestoreStagingProgress }

interface AccountAdminClient {
  auth: {
    signInWithPassword(input: { email: string; password: string }): Promise<{
      data: { user: { id: string } | null; session: unknown | null }
      error: { message?: string } | null
    }>
  }
  functions: {
    invoke<T>(name: string, options: { body: Record<string, unknown> }): Promise<{ data: T | null; error: unknown | null }>
  }
  storage: {
    from(bucket: string): {
      uploadToSignedUrl(
        path: string,
        token: string,
        body: Blob,
        options?: { contentType?: string },
      ): Promise<{ data: unknown | null; error: unknown | null }>
    }
  }
}

interface StatusResponse { status?: unknown }

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} is invalid`)
  return value as Record<string, unknown>
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is invalid`)
  return value.trim()
}

function nullableText(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null
  return text(value, label)
}

function parseStatus(value: unknown): AccountAdminStatus {
  const row = record(value, 'Account administration status')
  const otherRaw = row.otherMember
  const pendingRaw = row.pendingReplacement

  const other = otherRaw === null || otherRaw === undefined ? null : record(otherRaw, 'Other member')
  const pending = pendingRaw === null || pendingRaw === undefined ? null : record(pendingRaw, 'Pending replacement')
  if (typeof row.authCleanupPending !== 'boolean') throw new Error('Account cleanup status is invalid')

  return {
    otherMember: other ? {
      userId: text(other.userId, 'Other member id'),
      email: nullableText(other.email, 'Other member email'),
    } : null,
    pendingReplacement: pending ? {
      actionId: text(pending.actionId, 'Replacement action id'),
      replacementUserId: nullableText(pending.replacementUserId, 'Replacement user id'),
      replacementEmail: nullableText(pending.replacementEmail, 'Replacement email'),
      expiresAt: text(pending.expiresAt, 'Replacement expiry'),
      authCleanupPending: pending.authCleanupPending === true,
    } : null,
    authCleanupPending: row.authCleanupPending,
  }
}

export interface AccountAdminServiceDependencies {
  backupFactory?: typeof createCompleteBackup
  staging?: Pick<RestoreStagingService, 'stageArchive'>
}

export class AccountAdminService {
  private readonly backupFactory: typeof createCompleteBackup
  private readonly staging: Pick<RestoreStagingService, 'stageArchive'>

  constructor(
    private readonly client: AccountAdminClient,
    private readonly database: PowerSyncDatabase,
    private readonly pairId: string,
    private readonly actorUserId: string,
    private readonly appVersion: string,
    private readonly mediaDownloader: CompleteBackupMediaDownloader,
    dependencies: AccountAdminServiceDependencies = {},
  ) {
    this.backupFactory = dependencies.backupFactory ?? createCompleteBackup
    this.staging = dependencies.staging ?? new RestoreStagingService(client)
  }

  private async invoke<T extends Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.functions.invoke<T>('account-admin', { body })
    if (error || !data) throw new Error('Account administration request failed')
    return data
  }

  async status(): Promise<AccountAdminStatus> {
    const response = await this.invoke<StatusResponse & Record<string, unknown>>({ action: 'status' })
    return parseStatus(response.status)
  }

  async prepareSafety(
    onProgress?: (progress: AccountAdminSafetyProgress) => void,
  ): Promise<AccountAdminSafety> {
    const artifact = await this.backupFactory({
      database: this.database,
      pairId: this.pairId,
      actorUserId: this.actorUserId,
      appVersion: this.appVersion,
      mediaDownloader: this.mediaDownloader,
      onProgress: (progress) => onProgress?.({ stage: 'backup', progress }),
    })
    const job = await this.staging.stageArchive(
      artifact.file,
      'merge',
      (progress) => onProgress?.({ stage: 'staging', progress }),
    )
    if (job.mode !== 'merge' || job.status !== 'ready_to_commit') {
      throw new Error('Account administration safety backup did not validate')
    }
    return { artifact, job }
  }

  private async reauthenticate(email: string, password: string): Promise<void> {
    const normalizedEmail = email.trim().toLocaleLowerCase('en-US')
    if (!normalizedEmail || !password) throw new Error('Current email and password are required')
    const { data, error } = await this.client.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })
    if (error || !data.user || !data.session || data.user.id !== this.actorUserId) {
      throw new Error('Recent password authentication failed')
    }
  }

  async removeOther(input: { safety: AccountAdminSafety; currentEmail: string; password: string }): Promise<void> {
    await this.reauthenticate(input.currentEmail, input.password)
    await this.invoke({
      action: 'remove_other',
      safetyJobId: input.safety.job.id,
    })
  }

  async beginReplacement(input: {
    safety: AccountAdminSafety
    currentEmail: string
    password: string
    replacementEmail: string
  }): Promise<void> {
    await this.reauthenticate(input.currentEmail, input.password)
    await this.invoke({
      action: 'begin_replacement',
      safetyJobId: input.safety.job.id,
      replacementEmail: input.replacementEmail.trim(),
    })
  }

  async cancelReplacement(input: { currentEmail: string; password: string }): Promise<void> {
    await this.reauthenticate(input.currentEmail, input.password)
    await this.invoke({ action: 'cancel_replacement' })
  }

  async retryAuthCleanup(input: { currentEmail: string; password: string }): Promise<boolean> {
    await this.reauthenticate(input.currentEmail, input.password)
    const response = await this.invoke<Record<string, unknown>>({ action: 'retry_auth_cleanup' })
    if (typeof response.authCleanupPending !== 'boolean') throw new Error('Account cleanup response is invalid')
    return response.authCleanupPending
  }
}
