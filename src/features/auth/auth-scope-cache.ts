interface CachedAuthScope {
  version: 1
  userId: string
  pairId: string
}

const prefix = 'receitas:auth-scope:v1:'

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function readCachedAuthScope(userId: string): CachedAuthScope | null {
  const target = storage()
  if (!target) return null

  try {
    const raw = target.getItem(`${prefix}${userId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CachedAuthScope>
    if (parsed.version !== 1 || parsed.userId !== userId || typeof parsed.pairId !== 'string') return null
    return parsed as CachedAuthScope
  } catch {
    return null
  }
}

export function writeCachedAuthScope(userId: string, pairId: string): void {
  const target = storage()
  if (!target) return
  try {
    const value: CachedAuthScope = { version: 1, userId, pairId }
    target.setItem(`${prefix}${userId}`, JSON.stringify(value))
  } catch {
    // Offline authorization caching is an availability optimization only.
  }
}

export function clearCachedAuthScope(userId: string): void {
  const target = storage()
  if (!target) return
  try {
    target.removeItem(`${prefix}${userId}`)
  } catch {
    // Best effort. Server authorization remains authoritative.
  }
}
