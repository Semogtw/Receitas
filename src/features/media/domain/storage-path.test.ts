import { describe, expect, it } from 'vitest'
import { buildMediaStoragePath } from './storage-path'

describe('media storage path', () => {
  it('uses a deterministic pair and owner scoped path for idempotent retry', () => {
    expect(buildMediaStoragePath({
      pairId: 'pair-a', ownerType: 'recipe', ownerId: 'recipe-a', mediaId: 'photo-a', extension: 'webp',
    })).toBe('pairs/pair-a/recipes/recipe-a/photo-a.webp')

    expect(buildMediaStoragePath({
      pairId: 'pair-a', ownerType: 'cooking_session', ownerId: 'session-a', mediaId: 'photo-a', extension: 'jpg',
    })).toBe('pairs/pair-a/cooking-sessions/session-a/photo-a.jpg')
  })

  it('rejects unsafe path segments instead of concatenating arbitrary user data', () => {
    expect(() => buildMediaStoragePath({
      pairId: '../pair', ownerType: 'recipe', ownerId: 'recipe-a', mediaId: 'photo-a', extension: 'webp',
    })).toThrow('path segment')
    expect(() => buildMediaStoragePath({
      pairId: 'pair-a', ownerType: 'recipe', ownerId: 'recipe/a', mediaId: 'photo-a', extension: 'webp',
    })).toThrow('path segment')
  })
})
