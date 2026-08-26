import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import type { AuthAccount, AuthListener, AuthProvider, AuthSnapshot } from './auth'

function accountOf(user: User): AuthAccount { return { id: user.id, email: user.email ?? '', name: String(user.user_metadata.full_name ?? user.user_metadata.name ?? user.email ?? 'User'), pictureUrl: typeof user.user_metadata.avatar_url === 'string' ? user.user_metadata.avatar_url : null } }

export function createSupabaseClient(url: string, publishableKey: string): SupabaseClient { return createClient(url, publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) }

export class SupabaseAuthProvider implements AuthProvider {
  private snapshot: AuthSnapshot = { status: 'authenticating', account: null, error: null }
  private readonly listeners = new Set<AuthListener>()
  constructor(readonly client: SupabaseClient) {
    let authEventSeen = false
    client.auth.onAuthStateChange((_event, session) => {
      authEventSeen = true
      this.set({ status: session ? 'signed-in' : 'signed-out', account: session ? accountOf(session.user) : null, error: null })
    })
    void client.auth.getSession().then(({ data, error }) => {
      if (authEventSeen) return
      this.set(error ? { status: 'error', account: null, error: error.message } : { status: data.session ? 'signed-in' : 'signed-out', account: data.session ? accountOf(data.session.user) : null, error: null })
    })
  }
  getSnapshot() { return { ...this.snapshot, account: this.snapshot.account && { ...this.snapshot.account } } }
  subscribe(listener: AuthListener) { this.listeners.add(listener); listener(this.getSnapshot()); return () => { this.listeners.delete(listener) } }
  async signIn() { const { error } = await this.client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + window.location.pathname } }); if (error) throw error; return new Promise<AuthAccount>(() => undefined) }
  async logout() { const { error } = await this.client.auth.signOut(); if (error) throw error }
  async switchAccount() { await this.logout(); return this.signIn() }
  getAccessToken() { return null }
  private set(snapshot: AuthSnapshot) { this.snapshot = snapshot; this.listeners.forEach((listener) => listener(this.getSnapshot())) }
}
