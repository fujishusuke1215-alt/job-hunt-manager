import type { StorageMode } from '../domain/types'

export interface RuntimeConfig {
  storageMode: StorageMode
  googleClientId: string
  supabaseUrl: string
  supabasePublishableKey: string
  localDevelopment: boolean
}

export function getRuntimeConfig(): RuntimeConfig {
  const requested = import.meta.env.VITE_STORAGE_MODE
  const storageMode: StorageMode = requested ?? (import.meta.env.DEV ? 'local' : 'disabled')
  return {
    storageMode,
    googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? '',
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL?.trim() ?? '',
    supabasePublishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '',
    localDevelopment: storageMode === 'local',
  }
}
