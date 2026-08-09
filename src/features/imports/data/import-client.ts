import { uniqueWarnings, type ImportedRecipeDraft } from '../domain/normalize-import'
import { parseSchemaOrgRecipeJsonLd } from '../domain/schema-org'
import { parsePastedRecipeText } from '../domain/text-parser'

export interface ImportFunctionsClient {
  functions: {
    invoke: (
      functionName: string,
      options: { body: unknown },
    ) => Promise<{ data: unknown; error: { message: string } | null }>
  }
}

export type ImportStrategy = 'schema_org' | 'text_fallback' | 'pasted_text'

export interface ImportPreview {
  strategy: ImportStrategy
  draft: ImportedRecipeDraft
}

export class ImportClientError extends Error {
  constructor(readonly code: 'invalid_url' | 'remote_import_failed' | 'invalid_server_payload') {
    super(code)
    this.name = 'ImportClientError'
  }
}

interface ServerImportPayload {
  finalUrl: string
  jsonLd: string[]
  text: string
}

const MAX_SANITIZED_PAYLOAD_BYTES = 2 * 1024 * 1024

function validHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && !url.username
      && !url.password
  } catch {
    return false
  }
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function parseServerPayload(value: unknown): ServerImportPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const payload = value as Record<string, unknown>
  if (typeof payload.finalUrl !== 'string' || !validHttpUrl(payload.finalUrl)) return null
  if (!Array.isArray(payload.jsonLd) || !payload.jsonLd.every((entry) => typeof entry === 'string')) return null
  if (typeof payload.text !== 'string') return null
  if (payload.finalUrl.length > 4_096 || payload.jsonLd.length > 64) return null

  const totalBytes = utf8Bytes(payload.text)
    + payload.jsonLd.reduce((total, entry) => total + utf8Bytes(entry), 0)
  if (totalBytes > MAX_SANITIZED_PAYLOAD_BYTES) return null

  return {
    finalUrl: payload.finalUrl,
    jsonLd: payload.jsonLd as string[],
    text: payload.text,
  }
}

export class ImportClient {
  constructor(private readonly client: ImportFunctionsClient) {}

  async importFromUrl(rawUrl: string): Promise<ImportPreview> {
    const url = rawUrl.trim()
    if (!url || !validHttpUrl(url)) throw new ImportClientError('invalid_url')

    const { data, error } = await this.client.functions.invoke('import-url', {
      body: { url },
    })
    if (error) throw new ImportClientError('remote_import_failed')

    const payload = parseServerPayload(data)
    if (!payload) throw new ImportClientError('invalid_server_payload')

    for (const jsonLd of payload.jsonLd) {
      const draft = parseSchemaOrgRecipeJsonLd(jsonLd, payload.finalUrl)
      if (draft) return { strategy: 'schema_org', draft }
    }

    const draft = parsePastedRecipeText(payload.text)
    draft.sourceUrl = payload.finalUrl
    draft.warnings = uniqueWarnings([
      'Nenhum Recipe JSON-LD válido foi encontrado; a prévia usa o texto da página.',
      ...draft.warnings,
    ])
    return { strategy: 'text_fallback', draft }
  }

  importFromText(text: string): ImportPreview {
    return {
      strategy: 'pasted_text',
      draft: parsePastedRecipeText(text),
    }
  }
}
