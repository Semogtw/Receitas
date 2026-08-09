export type DiagnosticArea = 'sync' | 'media' | 'auth' | 'import' | 'backup' | 'pwa'
export type DiagnosticSeverity = 'info' | 'warning' | 'error'
export type DiagnosticPrimitive = string | number | boolean | null

export interface DiagnosticEvent {
  id: string
  timestamp: string
  area: DiagnosticArea
  code: string
  severity: DiagnosticSeverity
  technicalContext: Record<string, DiagnosticPrimitive>
}

export interface DiagnosticEventInput {
  area: DiagnosticArea
  code: string
  severity: DiagnosticSeverity
  technicalContext?: Record<string, unknown>
  timestamp?: string
}

const MAX_CONTEXT_FIELDS = 24
const MAX_STRING_LENGTH = 160

const ALLOWED_CONTEXT_KEYS = new Set([
  'appVersion',
  'buildId',
  'phase',
  'operation',
  'entityType',
  'queueCount',
  'pendingCount',
  'conflictCount',
  'attemptCount',
  'retryCount',
  'httpStatus',
  'statusCode',
  'errorCode',
  'online',
  'storageState',
  'serviceWorkerState',
  'mimeType',
  'byteSize',
  'width',
  'height',
  'durationMs',
  'batchIndex',
  'batchCount',
  'fileCount',
  'mediaCount',
  'browserFamily',
  'platformFamily',
  'restoreMode',
  'restoreStatus',
  'importStrategy',
  'syncStatus',
])

const FORBIDDEN_KEY_PATTERN = /(?:token|authorization|password|secret|email|mail|recipe|ingredient|instruction|title|description|note|comment|body|payload|content|image|photo|blob|base64|cookie|session|user.?id|pair.?id|url)/i
const SENSITIVE_STRING_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/i,
  /\b(?:sk|sb|eyJ)[-_A-Za-z0-9.]{16,}\b/,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /(?:^|[?&])(?:token|key|secret|code|auth)=/i,
  /data:image\//i,
]

function normalizedTimestamp(value: string | undefined): string {
  const timestamp = value ?? new Date().toISOString()
  const parsed = Date.parse(timestamp)
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== timestamp) {
    throw new Error('Diagnostic timestamp must be a normalized ISO value')
  }
  return timestamp
}

function normalizedCode(value: string): string {
  const code = value.trim().toLocaleLowerCase('en-US')
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(code)) {
    throw new Error('Diagnostic code must use a short technical identifier')
  }
  return code
}

function safePrimitive(value: unknown): DiagnosticPrimitive | undefined {
  if (value === null) return null
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined

  const text = value.trim().slice(0, MAX_STRING_LENGTH)
  if (!text) return ''
  if (SENSITIVE_STRING_PATTERNS.some((pattern) => pattern.test(text))) return '[redacted]'
  return text
}

export function sanitizeDiagnosticContext(input: Record<string, unknown> | undefined): Record<string, DiagnosticPrimitive> {
  if (!input) return {}
  const output: Record<string, DiagnosticPrimitive> = {}

  for (const [key, rawValue] of Object.entries(input)) {
    if (Object.keys(output).length >= MAX_CONTEXT_FIELDS) break
    if (FORBIDDEN_KEY_PATTERN.test(key) || !ALLOWED_CONTEXT_KEYS.has(key)) continue
    const value = safePrimitive(rawValue)
    if (value !== undefined) output[key] = value
  }

  return output
}

export function createDiagnosticEvent(input: DiagnosticEventInput): DiagnosticEvent {
  return {
    id: crypto.randomUUID(),
    timestamp: normalizedTimestamp(input.timestamp),
    area: input.area,
    code: normalizedCode(input.code),
    severity: input.severity,
    technicalContext: sanitizeDiagnosticContext(input.technicalContext),
  }
}

export function isDiagnosticEvent(value: unknown): value is DiagnosticEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const event = value as Partial<DiagnosticEvent>
  if (typeof event.id !== 'string' || typeof event.timestamp !== 'string' || typeof event.code !== 'string') return false
  if (!['sync', 'media', 'auth', 'import', 'backup', 'pwa'].includes(String(event.area))) return false
  if (!['info', 'warning', 'error'].includes(String(event.severity))) return false
  if (!event.technicalContext || typeof event.technicalContext !== 'object' || Array.isArray(event.technicalContext)) return false

  try {
    const recreated = sanitizeDiagnosticContext(event.technicalContext as Record<string, unknown>)
    return JSON.stringify(recreated) === JSON.stringify(event.technicalContext)
      && normalizedTimestamp(event.timestamp) === event.timestamp
      && normalizedCode(event.code) === event.code
  } catch {
    return false
  }
}
