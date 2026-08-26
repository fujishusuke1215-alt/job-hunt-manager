import { describe, expect, it } from 'vitest'
import {
  assertOnlyAllowedGoogleScopes,
  AuthProviderError,
  cloneAuthSnapshot,
  GOOGLE_AUTH_SCOPE,
  GOOGLE_AUTH_SCOPES,
} from './auth'

describe('AuthProvider contract', () => {
  it('通常loginはidentityと最小のDrive appData scopeだけをallowlistにする', () => {
    expect(GOOGLE_AUTH_SCOPES).toEqual([
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/drive.appdata',
    ])
    expect(GOOGLE_AUTH_SCOPE).not.toContain('gmail')
    expect(GOOGLE_AUTH_SCOPE).toContain('auth/drive.appdata')
    expect(() => assertOnlyAllowedGoogleScopes(GOOGLE_AUTH_SCOPE)).not.toThrow()
    expect(() => assertOnlyAllowedGoogleScopes([
      'openid',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/drive.appdata',
    ].join(' '))).not.toThrow()
  })

  it('広いDrive scopeやGmail scopeを含むtoken responseを拒否する', () => {
    expect(() => assertOnlyAllowedGoogleScopes(`${GOOGLE_AUTH_SCOPE} https://www.googleapis.com/auth/drive`))
      .toThrow(AuthProviderError)
    expect(() => assertOnlyAllowedGoogleScopes(`${GOOGLE_AUTH_SCOPE} https://www.googleapis.com/auth/gmail.readonly`))
      .toThrow('許可されたscope')
  })

  it('公開snapshotをcloneし、tokenを持たせない', () => {
    const source = {
      status: 'signed-in' as const,
      account: { id: 'account-1', email: 'demo@example.com', name: 'Demo', pictureUrl: null },
      error: null,
    }
    const snapshot = cloneAuthSnapshot(source)
    snapshot.account!.name = 'Changed'

    expect(source.account.name).toBe('Demo')
    expect(JSON.stringify(snapshot)).not.toContain('accessToken')
  })
})
