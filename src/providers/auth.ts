export const GOOGLE_AUTH_SCOPES = [
  'openid',
  'email',
  'profile',
] as const

export const GOOGLE_AUTH_SCOPE = GOOGLE_AUTH_SCOPES.join(' ')

const GOOGLE_SCOPE_ALIASES: Readonly<Record<string, (typeof GOOGLE_AUTH_SCOPES)[number]>> = {
  'https://www.googleapis.com/auth/userinfo.email': 'email',
  'https://www.googleapis.com/auth/userinfo.profile': 'profile',
}

export type AuthStatus = 'signed-out' | 'authenticating' | 'signed-in' | 'error'

export interface AuthAccount {
  id: string
  email: string
  name: string
  pictureUrl: string | null
}

export interface AuthSnapshot {
  status: AuthStatus
  account: AuthAccount | null
  error: string | null
}

export type AuthListener = (snapshot: AuthSnapshot) => void

export interface AuthProvider {
  getSnapshot(): AuthSnapshot
  subscribe(listener: AuthListener): () => void
  signIn(): Promise<AuthAccount>
  logout(): Promise<void>
  switchAccount(): Promise<AuthAccount>
  getAccessToken(): string | null
}

export type AuthErrorCode =
  | 'gis-unavailable'
  | 'invalid-client-id'
  | 'popup-closed'
  | 'oauth-error'
  | 'invalid-scope'
  | 'userinfo-failed'
  | 'invalid-userinfo'
  | 'token-expired'

export class AuthProviderError extends Error {
  readonly code: AuthErrorCode

  constructor(code: AuthErrorCode, message: string, options: { cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'AuthProviderError'
    this.code = code
  }
}

export function cloneAuthSnapshot(snapshot: AuthSnapshot): AuthSnapshot {
  return {
    status: snapshot.status,
    account: snapshot.account === null ? null : { ...snapshot.account },
    error: snapshot.error,
  }
}

export function assertOnlyAllowedGoogleScopes(scopeValue: string): void {
  const granted = new Set(scopeValue
    .split(/\s+/)
    .filter(Boolean)
    .map((scope) => GOOGLE_SCOPE_ALIASES[scope] ?? scope))
  const required = new Set<string>(GOOGLE_AUTH_SCOPES)
  const hasEveryRequired = GOOGLE_AUTH_SCOPES.every((scope) => granted.has(scope))
  const hasUnexpected = [...granted].some((scope) => !required.has(scope))

  if (!hasEveryRequired || hasUnexpected) {
    throw new AuthProviderError(
      'invalid-scope',
      '許可されたscopeはopenid、email、profileだけです。',
    )
  }
}
