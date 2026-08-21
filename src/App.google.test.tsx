import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDemoAppData } from './data/demoDataV2'

const googleHarness = vi.hoisted(() => ({
  provider: {
    getSnapshot: vi.fn(),
    subscribe: vi.fn(),
    signIn: vi.fn(),
    logout: vi.fn(),
    switchAccount: vi.fn(),
    getAccessToken: vi.fn(),
  },
  repository: {
    exists: vi.fn(),
    load: vi.fn(),
    save: vi.fn(),
    exportBackup: vi.fn(),
    importBackup: vi.fn(),
    commitImport: vi.fn(),
  },
}))

vi.mock('./config/runtime', () => ({
  getRuntimeConfig: () => ({
    storageMode: 'google',
    googleClientId: 'mock-client-id.apps.googleusercontent.com',
    localDevelopment: false,
  }),
}))

vi.mock('./providers/googleAuth', () => ({
  loadGoogleIdentityServices: vi.fn(async () => ({})),
  GoogleAuthProvider: vi.fn(function GoogleAuthProviderMock() {
    return googleHarness.provider
  }),
}))

vi.mock('./repositories/googleDriveStorage', () => ({
  GoogleDriveRestTransport: vi.fn(function GoogleDriveRestTransportMock() {
    return {}
  }),
  GoogleDriveStorageRepository: vi.fn(function GoogleDriveStorageRepositoryMock() {
    return googleHarness.repository
  }),
}))

import App from './App'

describe('App Google logout', () => {
  let finishRevoke!: () => void

  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('crypto', { randomUUID: () => 'google-test-id' })
    googleHarness.provider.signIn.mockResolvedValue({
      id: 'account-1',
      email: 'demo@example.com',
      name: 'Demo',
      pictureUrl: null,
    })
    googleHarness.provider.getAccessToken.mockReturnValue('memory-only-token')
    googleHarness.provider.logout.mockImplementation(() => new Promise<void>((resolve) => {
      finishRevoke = resolve
    }))
    const data = createDemoAppData()
    googleHarness.repository.load.mockResolvedValue({
      status: 'loaded',
      source: 'google-drive',
      data,
      version: 'gdrive:mock-version',
      remoteFile: null,
      migratedFromV1: false,
      legacyBackup: null,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('revoke完了を待たずaccount・personal data・同期表示を即時clearする', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '本人用' }))
    await user.click(screen.getByRole('button', { name: 'Googleでログインして読み込む' }))
    expect(await screen.findByText(/4社を読み込みました/)).toBeInTheDocument()
    expect(screen.getByText('demo@example.com')).toBeInTheDocument()
    expect(screen.getAllByText('サンプルテック').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'ログアウト' }))

    expect(googleHarness.provider.logout).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { name: '本人用データを開く' })).toBeInTheDocument()
    expect(screen.queryByText('demo@example.com')).not.toBeInTheDocument()
    expect(screen.queryByText('サンプルテック')).not.toBeInTheDocument()
    expect(screen.getByLabelText('保存状態 未ログイン')).toBeInTheDocument()

    finishRevoke()
  })
})
