import {
  assertOnlyAllowedGoogleScopes,
  AuthProviderError,
  cloneAuthSnapshot,
  GOOGLE_AUTH_SCOPE,
  type AuthAccount,
  type AuthListener,
  type AuthProvider,
  type AuthSnapshot,
} from './auth'

const GOOGLE_USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo'
const GOOGLE_GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client'

export interface GoogleTokenResponse {
  access_token?: string
  expires_in?: number | string
  scope?: string
  error?: string
  error_description?: string
}

export interface GoogleTokenClient {
  requestAccessToken(options?: {
    prompt?: '' | 'none' | 'consent' | 'select_account'
    scope?: string
    include_granted_scopes?: boolean
  }): void
}

export interface GoogleOAuth2Api {
  initTokenClient(options: {
    client_id: string
    scope: string
    include_granted_scopes: boolean
    callback: (response: GoogleTokenResponse) => void
    error_callback: (error: { type?: string; message?: string }) => void
  }): GoogleTokenClient
  revoke(accessToken: string, callback: (response: unknown) => void): void
}

export type AuthFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export interface GoogleAuthProviderOptions {
  clientId: string
  oauth2?: GoogleOAuth2Api
  fetch?: AuthFetch
  now?: () => number
}

function resolveGlobalOAuth2(): GoogleOAuth2Api | null {
  const globalValue = globalThis as typeof globalThis & {
    google?: { accounts?: { oauth2?: GoogleOAuth2Api } }
  }
  return globalValue.google?.accounts?.oauth2 ?? null
}

function defaultAuthFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init)
}

function authMessage(error: unknown): string {
  if (error instanceof AuthProviderError) return error.message
  return 'Googleログインに失敗しました。もう一度お試しください。'
}

function safeGooglePictureUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

export async function loadGoogleIdentityServices(
  ownerDocument: Document = document,
  timeoutMs = 15_000,
): Promise<GoogleOAuth2Api> {
  const existing = resolveGlobalOAuth2()
  if (existing !== null) return existing

  return new Promise<GoogleOAuth2Api>((resolve, reject) => {
    const selector = 'script[data-job-hunt-manager-gis="true"]'
    const prior = ownerDocument.querySelector<HTMLScriptElement>(selector)
    const script = prior ?? ownerDocument.createElement('script')
    let settled = false

    const finish = () => {
      if (settled) return
      const oauth2 = resolveGlobalOAuth2()
      if (oauth2 === null) {
        settled = true
        reject(new AuthProviderError('gis-unavailable', 'Google Identity Servicesを読み込めませんでした。'))
        return
      }
      settled = true
      resolve(oauth2)
    }
    const fail = () => {
      if (settled) return
      settled = true
      reject(new AuthProviderError('gis-unavailable', 'Google Identity Servicesの読込に失敗しました。'))
    }

    script.addEventListener('load', finish, { once: true })
    script.addEventListener('error', fail, { once: true })
    if (prior === null) {
      script.src = GOOGLE_GIS_SCRIPT_URL
      script.async = true
      script.defer = true
      script.dataset.jobHuntManagerGis = 'true'
      ownerDocument.head.append(script)
    }

    setTimeout(() => {
      if (settled) return
      settled = true
      reject(new AuthProviderError('gis-unavailable', 'Google Identity Servicesの読込がタイムアウトしました。'))
    }, timeoutMs)
  })
}

export class GoogleAuthProvider implements AuthProvider {
  private readonly clientId: string
  private readonly configuredOAuth2: GoogleOAuth2Api | null
  private readonly fetcher: AuthFetch
  private readonly now: () => number
  private readonly listeners = new Set<AuthListener>()
  private snapshot: AuthSnapshot = { status: 'signed-out', account: null, error: null }
  private accessToken: string | null = null
  private tokenExpiresAt = 0
  private authenticationInProgress = false

  constructor(options: GoogleAuthProviderOptions) {
    this.clientId = options.clientId.trim()
    this.configuredOAuth2 = options.oauth2 ?? null
    this.fetcher = options.fetch ?? defaultAuthFetch
    this.now = options.now ?? Date.now
  }

  getSnapshot(): AuthSnapshot {
    return cloneAuthSnapshot(this.snapshot)
  }

  subscribe(listener: AuthListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async signIn(): Promise<AuthAccount> {
    return this.authenticate('select_account')
  }

  async logout(): Promise<void> {
    const token = this.accessToken
    this.clearMemory()
    this.setSnapshot({ status: 'signed-out', account: null, error: null })
    if (token !== null) await this.revokeQuietly(token)
  }

  async switchAccount(): Promise<AuthAccount> {
    await this.logout()
    return this.authenticate('select_account')
  }

  getAccessToken(): string | null {
    if (this.accessToken === null) return null
    if (this.now() >= this.tokenExpiresAt) {
      this.clearMemory()
      this.setSnapshot({
        status: 'signed-out',
        account: null,
        error: 'Google認証の有効期限が切れました。もう一度ログインしてください。',
      })
      return null
    }
    return this.accessToken
  }

  private async authenticate(
    prompt: 'consent' | 'select_account',
  ): Promise<AuthAccount> {
    if (!this.clientId) {
      const error = new AuthProviderError(
        'invalid-client-id',
        'Google Client IDが設定されていません。',
      )
      this.setSnapshot({ status: 'error', account: null, error: error.message })
      throw error
    }
    if (this.authenticationInProgress) {
      throw new AuthProviderError('oauth-error', 'Googleログイン処理は既に進行中です。')
    }

    const oauth2 = this.configuredOAuth2 ?? resolveGlobalOAuth2()
    if (oauth2 === null) {
      const error = new AuthProviderError(
        'gis-unavailable',
        'Google Identity Servicesが未読込です。',
      )
      this.setSnapshot({ status: 'error', account: null, error: error.message })
      throw error
    }

    this.authenticationInProgress = true
    this.clearMemory()
    this.setSnapshot({ status: 'authenticating', account: null, error: null })

    try {
      const tokenResponse = await this.requestToken(oauth2, prompt)
      if (!tokenResponse.access_token) {
        throw new AuthProviderError('oauth-error', 'Googleからアクセストークンを取得できませんでした。')
      }
      assertOnlyAllowedGoogleScopes(tokenResponse.scope ?? '')

      const expiresInSeconds = Number(tokenResponse.expires_in)
      if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
        throw new AuthProviderError('token-expired', 'Googleアクセストークンの有効期限が不正です。')
      }

      const account = await this.fetchAccount(tokenResponse.access_token)
      this.accessToken = tokenResponse.access_token
      this.tokenExpiresAt = this.now() + (expiresInSeconds * 1_000)
      this.setSnapshot({ status: 'signed-in', account, error: null })
      return { ...account }
    } catch (error) {
      this.clearMemory()
      this.setSnapshot({ status: 'error', account: null, error: authMessage(error) })
      throw error
    } finally {
      this.authenticationInProgress = false
    }
  }

  private requestToken(
    oauth2: GoogleOAuth2Api,
    prompt: 'consent' | 'select_account',
  ): Promise<GoogleTokenResponse> {
    return new Promise((resolve, reject) => {
      let settled = false
      const resolveOnce = (response: GoogleTokenResponse) => {
        if (settled) return
        settled = true
        if (response.error) {
          reject(new AuthProviderError('oauth-error', 'Googleによる認可が完了しませんでした。'))
        } else {
          resolve(response)
        }
      }
      const rejectOnce = (error: { type?: string }) => {
        if (settled) return
        settled = true
        const popupClosed = error.type === 'popup_closed'
        reject(new AuthProviderError(
          popupClosed ? 'popup-closed' : 'oauth-error',
          popupClosed
            ? 'Googleログイン画面が閉じられました。データは変更していません。'
            : 'Googleログイン画面を開けませんでした。',
        ))
      }

      try {
        const client = oauth2.initTokenClient({
          client_id: this.clientId,
          scope: GOOGLE_AUTH_SCOPE,
          include_granted_scopes: false,
          callback: resolveOnce,
          error_callback: rejectOnce,
        })
        client.requestAccessToken({
          prompt,
          scope: GOOGLE_AUTH_SCOPE,
          include_granted_scopes: false,
        })
      } catch (error) {
        reject(new AuthProviderError('oauth-error', 'Googleログインの開始に失敗しました。', { cause: error }))
      }
    })
  }

  private async fetchAccount(accessToken: string): Promise<AuthAccount> {
    let response: Response
    try {
      response = await this.fetcher(GOOGLE_USERINFO_ENDPOINT, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      })
    } catch (error) {
      throw new AuthProviderError('userinfo-failed', 'Googleアカウント情報を取得できませんでした。', {
        cause: error,
      })
    }
    if (!response.ok) {
      throw new AuthProviderError(
        'userinfo-failed',
        `Googleアカウント情報の取得に失敗しました（HTTP ${response.status}）。`,
      )
    }

    const value = await response.json() as unknown
    if (typeof value !== 'object' || value === null) {
      throw new AuthProviderError('invalid-userinfo', 'Googleアカウント情報の形式が不正です。')
    }
    const candidate = value as Record<string, unknown>
    if (
      typeof candidate.sub !== 'string' ||
      typeof candidate.email !== 'string' ||
      typeof candidate.name !== 'string' ||
      (candidate.picture !== undefined && typeof candidate.picture !== 'string')
    ) {
      throw new AuthProviderError('invalid-userinfo', 'Googleアカウント情報の必須項目が不足しています。')
    }

    return {
      id: candidate.sub,
      email: candidate.email,
      name: candidate.name,
      pictureUrl: safeGooglePictureUrl(candidate.picture),
    }
  }

  private async revokeQuietly(accessToken: string): Promise<void> {
    const oauth2 = this.configuredOAuth2 ?? resolveGlobalOAuth2()
    if (oauth2 === null) return
    await new Promise<void>((resolve) => {
      let settled = false
      let timeout: ReturnType<typeof setTimeout>
      const finish = () => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        resolve()
      }
      try {
        timeout = setTimeout(finish, 2_000)
        oauth2.revoke(accessToken, finish)
      } catch {
        finish()
      }
    })
  }

  private clearMemory(): void {
    this.accessToken = null
    this.tokenExpiresAt = 0
  }

  private setSnapshot(snapshot: AuthSnapshot): void {
    this.snapshot = cloneAuthSnapshot(snapshot)
    const publicSnapshot = this.getSnapshot()
    this.listeners.forEach((listener) => listener(publicSnapshot))
  }
}
