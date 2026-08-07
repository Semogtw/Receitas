function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

async function sha256Bytes(value: string): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(value)
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoded))
}

export async function constantTimeSecretEquals(left: string, right: string): Promise<boolean> {
  const [leftDigest, rightDigest] = await Promise.all([sha256Bytes(left), sha256Bytes(right)])
  let mismatch = 0
  for (let index = 0; index < leftDigest.length; index += 1) {
    mismatch |= leftDigest[index] ^ rightDigest[index]
  }
  return mismatch === 0
}

export function randomOpaqueToken(bytesLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(bytesLength))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export async function sha256Hex(value: string): Promise<string> {
  return toHex(await sha256Bytes(value))
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return email
}
