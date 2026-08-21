import { describe, expect, it, vi } from 'vitest'
import { GOOGLE_AUTH_SCOPE } from './auth'
import {
  GoogleAuthProvider,
  type AuthFetch,
  type GoogleOAuth2Api,
  type GoogleTokenClient,
  type GoogleTokenResponse,
} from './googleAuth'

type OAuthOutcome =
  | { kind: 'token'; response: GoogleTokenResponse }
  | { kind: 'popup-error'; type: string }

class FakeOAuth2 implements GoogleOAuth2Api {
  readonly outcomes: OAuthOutcome[] = []
  readonly configs: Parameters<GoogleOAuth2Api['initTokenClient']>[0][] = []
  readonly requests: Parameters<GoogleTokenClient['requestAccessToken']>[0][] = []
  readonly revoked: string[] = []

  initTokenClient(config: Parameters<GoogleOAuth2Api['initTokenClient']>[0]): GoogleTokenClient {
    this.configs.push(config)
    return {
      requestAccessToken: (options) => {
        this.requests.push(options)
        const outcome = this.outcomes.shift()
        if (!outcome) throw new Error('missing fake OAuth outcome')
        queueMicrotask(() => {
          if (outcome.kind === 'token') config.callback(outcome.response)
          else config.error_callback({ type: outcome.type })
        })
      },
    }
  }

  revoke(accessToken: string, callback: (response: unknown) => void): void {
    this.revoked.push(accessToken)
    queueMicrotask(() => callback({ successful: true }))
  }
}

function token(accessToken: string): OAuthOutcome {
  return {
    kind: 'token',
    response: {
      access_token: accessToken,
      expires_in: 3_600,
      scope: GOOGLE_AUTH_SCOPE,
    },
  }
}

function accountFetch(): AuthFetch {
  return vi.fn<AuthFetch>(async (_input, init) => {
    const authorization = new Headers(init?.headers).get('Authorization') ?? ''
    const accessToken = authorization.replace('Bearer ', '')
    const suffix = accessToken.endsWith('-b') ? 'b' : 'a'
    return new Response(JSON.stringify({
      sub: `account-${suffix}`,
      email: `${suffix}@example.com`,
      name: `Account ${suffix.toUpperCase()}`,
      picture: `https://example.com/${suffix}.png`,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
}

describe('GoogleAuthProvider', () => {
  it('初期状態は未ログインでtokenを持たない', () => {
    const provider = new GoogleAuthProvider({
      clientId: 'client-id.apps.googleusercontent.com',
      oauth2: new FakeOAuth2(),
      fetch: accountFetch(),
    })

    expect(provider.getSnapshot()).toEqual({ status: 'signed-out', account: null, error: null })
    expect(provider.getAccessToken()).toBeNull()
  })

  it('GIS Token modelでログインし、tokenはメモリ内だけに保持する', async () => {
    const oauth2 = new FakeOAuth2()
    oauth2.outcomes.push(token('token-a'))
    const provider = new GoogleAuthProvider({
      clientId: 'client-id.apps.googleusercontent.com',
      oauth2,
      fetch: accountFetch(),
      now: () => 1_000,
    })
    const listener = vi.fn()
    provider.subscribe(listener)

    await expect(provider.signIn()).resolves.toMatchObject({ id: 'account-a', email: 'a@example.com' })
    expect(provider.getSnapshot().status).toBe('signed-in')
    expect(provider.getAccessToken()).toBe('token-a')
    expect(JSON.stringify(provider.getSnapshot())).not.toContain('token-a')
    expect(oauth2.configs[0]).toMatchObject({
      client_id: 'client-id.apps.googleusercontent.com',
      scope: GOOGLE_AUTH_SCOPE,
      include_granted_scopes: false,
    })
    expect(oauth2.requests[0]).toEqual({
      prompt: 'select_account',
      scope: GOOGLE_AUTH_SCOPE,
      include_granted_scopes: false,
    })
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ status: 'signed-in' }))
  })

  it('ログイン失敗時はaccount/tokenを残さない', async () => {
    const oauth2 = new FakeOAuth2()
    oauth2.outcomes.push({
      kind: 'token',
      response: { error: 'access_denied', error_description: 'denied' },
    })
    const provider = new GoogleAuthProvider({
      clientId: 'client-id.apps.googleusercontent.com',
      oauth2,
      fetch: accountFetch(),
    })

    await expect(provider.signIn()).rejects.toThrow('認可')
    expect(provider.getSnapshot()).toMatchObject({ status: 'error', account: null })
    expect(provider.getAccessToken()).toBeNull()
  })

  it('popupを閉じた失敗を区別する', async () => {
    const oauth2 = new FakeOAuth2()
    oauth2.outcomes.push({ kind: 'popup-error', type: 'popup_closed' })
    const provider = new GoogleAuthProvider({
      clientId: 'client-id.apps.googleusercontent.com',
      oauth2,
      fetch: accountFetch(),
    })

    await expect(provider.signIn()).rejects.toMatchObject({ code: 'popup-closed' })
    expect(provider.getSnapshot().status).toBe('error')
  })

  it('logoutでtokenとaccountをclearし、GIS revokeを呼ぶ', async () => {
    const oauth2 = new FakeOAuth2()
    oauth2.outcomes.push(token('token-a'))
    const provider = new GoogleAuthProvider({
      clientId: 'client-id.apps.googleusercontent.com',
      oauth2,
      fetch: accountFetch(),
    })
    await provider.signIn()

    await provider.logout()

    expect(provider.getSnapshot()).toEqual({ status: 'signed-out', account: null, error: null })
    expect(provider.getAccessToken()).toBeNull()
    expect(oauth2.revoked).toEqual(['token-a'])
  })

  it('account switchで旧tokenを破棄し、選び直したaccountへ入れ替える', async () => {
    const oauth2 = new FakeOAuth2()
    oauth2.outcomes.push(token('token-a'), token('token-b'))
    const provider = new GoogleAuthProvider({
      clientId: 'client-id.apps.googleusercontent.com',
      oauth2,
      fetch: accountFetch(),
    })
    await provider.signIn()

    const switched = await provider.switchAccount()

    expect(switched).toMatchObject({ id: 'account-b', email: 'b@example.com' })
    expect(provider.getAccessToken()).toBe('token-b')
    expect(oauth2.revoked).toEqual(['token-a'])
    expect(oauth2.requests).toHaveLength(2)
    expect(oauth2.requests.every((request) => request?.prompt === 'select_account')).toBe(true)
  })

  it('allowlist外scopeを含む応答を拒否する', async () => {
    const oauth2 = new FakeOAuth2()
    oauth2.outcomes.push({
      kind: 'token',
      response: {
        access_token: 'token-with-gmail',
        expires_in: 3_600,
        scope: `${GOOGLE_AUTH_SCOPE} https://www.googleapis.com/auth/gmail.readonly`,
      },
    })
    const provider = new GoogleAuthProvider({
      clientId: 'client-id.apps.googleusercontent.com',
      oauth2,
      fetch: accountFetch(),
    })

    await expect(provider.signIn()).rejects.toMatchObject({ code: 'invalid-scope' })
    expect(provider.getAccessToken()).toBeNull()
  })
})
