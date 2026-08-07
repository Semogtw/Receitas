import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readPublicEnv } from '../env'

let client: SupabaseClient | undefined

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    const env = readPublicEnv()
    client = createClient(env.supabaseUrl, env.supabaseAnonKey)
  }

  return client
}
