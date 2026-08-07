export interface PublicEnv {
  supabaseUrl: string
  supabaseAnonKey: string
  powersyncUrl: string
}

export function readPublicEnv(source: ImportMetaEnv = import.meta.env): PublicEnv {
  const supabaseUrl = source.VITE_SUPABASE_URL
  const supabaseAnonKey = source.VITE_SUPABASE_ANON_KEY
  const powersyncUrl = source.VITE_POWERSYNC_URL

  if (!supabaseUrl || !supabaseAnonKey || !powersyncUrl) {
    throw new Error('Missing required public environment configuration')
  }

  return { supabaseUrl, supabaseAnonKey, powersyncUrl }
}
