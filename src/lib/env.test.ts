import { describe, expect, it } from 'vitest'
import { readPublicEnv } from './env'

describe('readPublicEnv', () => {
  it('returns required public configuration', () => {
    expect(readPublicEnv({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'public-anon-key',
      VITE_POWERSYNC_URL: 'https://sync.example.test',
    } as ImportMetaEnv)).toEqual({
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'public-anon-key',
      powersyncUrl: 'https://sync.example.test',
    })
  })

  it('throws a sanitized error when configuration is missing', () => {
    expect(() => readPublicEnv({} as ImportMetaEnv)).toThrow(
      'Missing required public environment configuration',
    )
  })
})
