import { beforeEach, describe, expect, it, vi } from 'vitest'

const createClientMock = vi.hoisted(() => vi.fn(() => ({ auth: {} })))
const readPublicEnvMock = vi.hoisted(() => vi.fn(() => ({
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'sb_publishable_public-test',
  powersyncUrl: 'https://sync.example.test',
})))

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}))

vi.mock('../env', () => ({
  readPublicEnv: readPublicEnvMock,
}))

describe('getSupabaseClient', () => {
  beforeEach(() => {
    createClientMock.mockClear()
    readPublicEnvMock.mockClear()
    vi.resetModules()
  })

  it('creates a browser client only from public configuration and reuses it', async () => {
    const { getSupabaseClient } = await import('./client')

    const first = getSupabaseClient()
    const second = getSupabaseClient()

    expect(first).toBe(second)
    expect(readPublicEnvMock).toHaveBeenCalledTimes(1)
    expect(createClientMock).toHaveBeenCalledTimes(1)
    expect(createClientMock).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'sb_publishable_public-test',
    )
  })
})
