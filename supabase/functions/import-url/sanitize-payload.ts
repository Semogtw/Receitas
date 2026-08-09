import type { SafeImportPayload } from './safe-fetch.ts'

export interface SanitizedImportPayload {
  finalUrl: string
  jsonLd: string[]
  text: string
}

const SCRIPT_PATTERN = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/giu
const ACTIVE_BLOCK_PATTERN = /<(style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/giu
const COMMENT_PATTERN = /<!--[\s\S]*?-->/gu
const BLOCK_BOUNDARY_PATTERN = /<\/?(?:address|article|aside|blockquote|div|dl|dt|dd|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>/giu
const BREAK_PATTERN = /<br\s*\/?>/giu
const TAG_PATTERN = /<[^>]+>/gu

function scriptType(attributes: string): string | null {
  const match = /\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/iu.exec(attributes)
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim().toLocaleLowerCase('en-US') || null
}

function decodeEntity(entity: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  }
  if (entity in named) return named[entity]!

  const numeric = entity.startsWith('#x') || entity.startsWith('#X')
    ? Number.parseInt(entity.slice(2), 16)
    : entity.startsWith('#')
      ? Number.parseInt(entity.slice(1), 10)
      : Number.NaN
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > 0x10ffff || (numeric >= 0xd800 && numeric <= 0xdfff)) {
    return `&${entity};`
  }
  return String.fromCodePoint(numeric)
}

function decodeEntities(value: string): string {
  return value.replace(/&([a-zA-Z][a-zA-Z0-9]+|#[0-9]+|#x[0-9a-fA-F]+);/g, (_match, entity: string) => {
    const lower = entity.startsWith('#') ? entity : entity.toLocaleLowerCase('en-US')
    return decodeEntity(lower)
  })
}

function visibleText(html: string): string {
  const withoutActiveContent = html
    .replace(SCRIPT_PATTERN, ' ')
    .replace(ACTIVE_BLOCK_PATTERN, ' ')
    .replace(COMMENT_PATTERN, ' ')
    .replace(BREAK_PATTERN, '\n')
    .replace(BLOCK_BOUNDARY_PATTERN, '\n')
    .replace(TAG_PATTERN, ' ')

  return decodeEntities(withoutActiveContent)
    .split(/\n+/)
    .map((line) => line.replace(/[\t\f\v ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim()
}

function extractJsonLd(html: string): string[] {
  const values: string[] = []
  for (const match of html.matchAll(SCRIPT_PATTERN)) {
    if (scriptType(match[1] ?? '') !== 'application/ld+json') continue
    const value = (match[2] ?? '').trim()
    if (value) values.push(value)
  }
  return values
}

export function sanitizeImportPayload(payload: SafeImportPayload): SanitizedImportPayload {
  if (payload.contentType === 'application/ld+json') {
    return {
      finalUrl: payload.finalUrl,
      jsonLd: payload.body.trim() ? [payload.body.trim()] : [],
      text: '',
    }
  }

  return {
    finalUrl: payload.finalUrl,
    jsonLd: extractJsonLd(payload.body),
    text: visibleText(payload.body),
  }
}
