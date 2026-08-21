import type { StorageMode } from '../domain/types'

export interface RuntimeConfig {
  storageMode: StorageMode
  googleClientId: string
  localDevelopment: boolean
}

export function getRuntimeConfig(): RuntimeConfig {
  const requested = import.meta.env.VITE_STORAGE_MODE
  const storageMode: StorageMode = requested ?? (import.meta.env.DEV ? 'local' : 'disabled')
  return {
    storageMode,
    googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? '',
    localDevelopment: storageMode === 'local',
  }
}
