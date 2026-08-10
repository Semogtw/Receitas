export type HostResolver = (hostname: string) => Promise<string[]>

export interface PinnedFetchTransport {
  fetch(input: URL, init: RequestInit): Promise<Response>
  close(): void
}

export type PinnedFetchTransportFactory = (url: URL, address: string) => PinnedFetchTransport

export interface SafeFetchOptions {
  resolver?: HostResolver
  /** Test seam. Production callers should rely on the pinned Deno transport. */
  fetchImpl?: typeof fetch
  transportFactory?: PinnedFetchTransportFactory
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
}

export interface SafeImportPayload {
  body: string
  contentType: 'text/html' | 'application/xhtml+xml' | 'application/ld+json'
  finalUrl: string
}

interface ResolvedImportTarget {
  url: URL
  addresses: string[]
}

export class ImportFetchError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'ImportFetchError'
  }
}

const DEFAULT_TIMEOUT_MS = 8_000
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024
const DEFAULT_MAX_REDIRECTS = 3
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const ALLOWED_CONTENT_TYPES = new Set<SafeImportPayload['contentType']>([
  'text/html',
  'application/xhtml+xml',
  'application/ld+json',
])

function parseIpv4(value: string): number | null {
  const parts = value.split('.')
  if (parts.length !== 4) return null
  let result = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const octet = Number(part)
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null
    result = ((result << 8) | octet) >>> 0
  }
  return result >>> 0
}

function ipv4InRange(value: number, base: number, prefix: number): boolean {
  if (prefix === 0) return true
  const mask = prefix === 32 ? 0xffffffff : (0xffffffff << (32 - prefix)) >>> 0
  return (value & mask) >>> 0 === (base & mask) >>> 0
}

const BLOCKED_IPV4_RANGES: Array<[number, number]> = [
  [parseIpv4('0.0.0.0')!, 8],
  [parseIpv4('10.0.0.0')!, 8],
  [parseIpv4('100.64.0.0')!, 10],
  [parseIpv4('127.0.0.0')!, 8],
  [parseIpv4('169.254.0.0')!, 16],
  [parseIpv4('172.16.0.0')!, 12],
  [parseIpv4('192.0.0.0')!, 24],
  [parseIpv4('192.0.2.0')!, 24],
  [parseIpv4('192.88.99.0')!, 24],
  [parseIpv4('192.168.0.0')!, 16],
  [parseIpv4('198.18.0.0')!, 15],
  [parseIpv4('198.51.100.0')!, 24],
  [parseIpv4('203.0.113.0')!, 24],
  [parseIpv4('224.0.0.0')!, 4],
  [parseIpv4('240.0.0.0')!, 4],
]

function isPublicIpv4Number(value: number): boolean {
  return !BLOCKED_IPV4_RANGES.some(([base, prefix]) => ipv4InRange(value, base, prefix))
}

function expandIpv4Tail(address: string): string | null {
  if (!address.includes('.')) return address
  const separator = address.lastIndexOf(':')
  if (separator < 0) return null
  const ipv4 = parseIpv4(address.slice(separator + 1))
  if (ipv4 === null) return null
  const high = ((ipv4 >>> 16) & 0xffff).toString(16)
  const low = (ipv4 & 0xffff).toString(16)
  return `${address.slice(0, separator)}:${high}:${low}`
}

function parseIpv6(value: string): bigint | null {
  let address = value.trim().toLocaleLowerCase('en-US')
  if (address.startsWith('[') && address.endsWith(']')) address = address.slice(1, -1)
  if (!address || address.includes('%')) return null

  const expandedTail = expandIpv4Tail(address)
  if (!expandedTail) return null
  address = expandedTail

  const halves = address.split('::')
  if (halves.length > 2) return null

  const left = halves[0] ? halves[0].split(':') : []
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const allParts = [...left, ...right]
  if (allParts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null

  let parts: string[]
  if (halves.length === 1) {
    if (allParts.length !== 8) return null
    parts = allParts
  } else {
    const missing = 8 - allParts.length
    if (missing < 1) return null
    parts = [...left, ...Array.from({ length: missing }, () => '0'), ...right]
  }

  let result = 0n
  for (const part of parts) result = (result << 16n) | BigInt(Number.parseInt(part, 16))
  return result
}

function ipv6InRange(value: bigint, baseText: string, prefix: number): boolean {
  const base = parseIpv6(baseText)
  if (base === null) throw new Error(`Invalid static IPv6 range: ${baseText}`)
  if (prefix === 0) return true
  const shift = 128n - BigInt(prefix)
  return (value >> shift) === (base >> shift)
}

function mappedIpv4(value: bigint): number | null {
  if (!ipv6InRange(value, '::ffff:0:0', 96)) return null
  return Number(value & 0xffffffffn) >>> 0
}

function isPublicIpv6Number(value: bigint): boolean {
  const mapped = mappedIpv4(value)
  if (mapped !== null) return isPublicIpv4Number(mapped)

  const blocked: Array<[string, number]> = [
    ['::', 96],
    ['64:ff9b::', 96],
    ['64:ff9b:1::', 48],
    ['100::', 64],
    ['2001::', 32],
    ['2001:2::', 48],
    ['2001:10::', 28],
    ['2001:20::', 28],
    ['2001:db8::', 32],
    ['2002::', 16],
    ['fc00::', 7],
    ['fe80::', 10],
    ['ff00::', 8],
  ]
  return !blocked.some(([base, prefix]) => ipv6InRange(value, base, prefix))
}

export function isPublicIpAddress(rawValue: string): boolean {
  const value = rawValue.trim().replace(/^\[|\]$/g, '')
  const ipv4 = parseIpv4(value)
  if (ipv4 !== null) return isPublicIpv4Number(ipv4)
  const ipv6 = parseIpv6(value)
  if (ipv6 !== null) return isPublicIpv6Number(ipv6)
  return false
}

function isLiteralIp(hostname: string): boolean {
  return parseIpv4(hostname) !== null || parseIpv6(hostname) !== null
}

function forbiddenHostname(hostname: string): boolean {
  const normalized = hostname.replace(/\.$/, '').toLocaleLowerCase('en-US')
  if (!normalized || normalized === 'localhost') return true
  const forbiddenSuffixes = [
    '.localhost',
    '.local',
    '.internal',
    '.home',
    '.lan',
    '.test',
    '.invalid',
    '.example',
  ]
  return forbiddenSuffixes.some((suffix) => normalized.endsWith(suffix))
}

export const resolveHostWithDeno: HostResolver = async (hostname) => {
  const answers = await Promise.allSettled([
    Deno.resolveDns(hostname, 'A'),
    Deno.resolveDns(hostname, 'AAAA'),
  ])
  const addresses = answers.flatMap((answer) => answer.status === 'fulfilled' ? answer.value : [])
  if (addresses.length === 0) throw new ImportFetchError('dns_resolution_failed')
  return addresses
}

async function resolvePublicImportTarget(
  rawUrl: string,
  resolver: HostResolver,
): Promise<ResolvedImportTarget> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new ImportFetchError('invalid_url')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ImportFetchError('http_or_https_required')
  }
  if (url.username || url.password) throw new ImportFetchError('credentials_not_allowed')
  if (url.port) throw new ImportFetchError('port_not_allowed')

  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (forbiddenHostname(hostname)) throw new ImportFetchError('hostname_not_allowed')

  if (isLiteralIp(hostname)) {
    if (!isPublicIpAddress(hostname)) throw new ImportFetchError('resolved_address_not_public')
    return { url, addresses: [hostname] }
  }

  const addresses = await resolver(hostname)
  if (addresses.length === 0) throw new ImportFetchError('dns_resolution_failed')
  if (addresses.some((address) => !isPublicIpAddress(address))) {
    throw new ImportFetchError('resolved_address_not_public')
  }
  return { url, addresses }
}

export async function assertPublicImportUrl(
  rawUrl: string,
  resolver: HostResolver = resolveHostWithDeno,
): Promise<URL> {
  return (await resolvePublicImportTarget(rawUrl, resolver)).url
}

/**
 * Pins the TCP connection to an address that was already checked as public.
 * The fetch URL remains the original hostname, so HTTP Host and TLS certificate
 * validation continue to use the requested origin instead of the raw IP.
 */
export const createPinnedDenoTransport: PinnedFetchTransportFactory = (url, address) => {
  const client = Deno.createHttpClient({
    proxy: {
      transport: 'tcp',
      hostname: address,
      port: url.protocol === 'https:' ? 443 : 80,
    },
  })

  return {
    fetch: (input, init) => fetch(input, { ...init, client }),
    close: () => client.close(),
  }
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const contentLength = response.headers.get('content-length')
  if (contentLength) {
    const declared = Number(contentLength)
    if (Number.isFinite(declared) && declared > maxBytes) throw new ImportFetchError('response_too_large')
  }

  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel('response_too_large')
        throw new ImportFetchError('response_too_large')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const combined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(combined)
}

function normalizedContentType(response: Response): SafeImportPayload['contentType'] {
  const mediaType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLocaleLowerCase('en-US') ?? ''
  if (!ALLOWED_CONTENT_TYPES.has(mediaType as SafeImportPayload['contentType'])) {
    throw new ImportFetchError('content_type_not_allowed')
  }
  return mediaType as SafeImportPayload['contentType']
}

function requestSignal(timeoutMs: number): AbortSignal {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30_000) {
    throw new ImportFetchError('invalid_timeout')
  }
  return AbortSignal.timeout(timeoutMs)
}

function injectedFetchTransport(fetchImpl: typeof fetch): PinnedFetchTransport {
  return {
    fetch: (input, init) => fetchImpl(input, init),
    close: () => undefined,
  }
}

export async function safeFetchImportPayload(
  rawUrl: string,
  options: SafeFetchOptions = {},
): Promise<SafeImportPayload> {
  const resolver = options.resolver ?? resolveHostWithDeno
  const transportFactory = options.transportFactory ?? createPinnedDenoTransport
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS

  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 4 * 1024 * 1024) {
    throw new ImportFetchError('invalid_max_bytes')
  }
  if (!Number.isSafeInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 5) {
    throw new ImportFetchError('invalid_max_redirects')
  }

  let current = await resolvePublicImportTarget(rawUrl, resolver)

  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    // Every resolved address must be public; pinning to the first validated A/AAAA
    // answer prevents a second DNS lookup inside fetch from rebinding to localhost,
    // metadata services or another private range.
    const transport = options.fetchImpl
      ? injectedFetchTransport(options.fetchImpl)
      : transportFactory(current.url, current.addresses[0]!)

    try {
      let response: Response
      try {
        response = await transport.fetch(current.url, {
          method: 'GET',
          redirect: 'manual',
          signal: requestSignal(timeoutMs),
          headers: {
            accept: 'text/html,application/xhtml+xml,application/ld+json;q=0.9',
          },
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
        })
      } catch (error) {
        if (error instanceof DOMException && error.name === 'TimeoutError') {
          throw new ImportFetchError('fetch_timeout')
        }
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new ImportFetchError('fetch_timeout')
        }
        if (error instanceof ImportFetchError) throw error
        throw new ImportFetchError('fetch_failed')
      }

      if (REDIRECT_STATUSES.has(response.status)) {
        if (redirects >= maxRedirects) throw new ImportFetchError('too_many_redirects')
        const location = response.headers.get('location')
        if (!location) throw new ImportFetchError('redirect_without_location')

        let next: URL
        try {
          next = new URL(location, current.url)
        } catch {
          throw new ImportFetchError('invalid_redirect_url')
        }
        if (current.url.protocol === 'https:' && next.protocol === 'http:') {
          throw new ImportFetchError('https_downgrade_not_allowed')
        }
        current = await resolvePublicImportTarget(next.toString(), resolver)
        continue
      }

      if (!response.ok) throw new ImportFetchError(`upstream_http_${response.status}`)
      const contentType = normalizedContentType(response)
      const body = await readBoundedText(response, maxBytes)
      return { body, contentType, finalUrl: current.url.toString() }
    } finally {
      transport.close()
    }
  }

  throw new ImportFetchError('too_many_redirects')
}
