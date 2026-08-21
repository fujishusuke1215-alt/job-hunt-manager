import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDemoAppData } from './data/demoDataV2'
import { createDemoCompanies } from './data/demoData'
import { createEmptyAppData, V1_BACKUP_PREFIX, V1_STORAGE_KEY, V2_STORAGE_KEY } from './domain/migration'
import { StorageRepositoryError } from './repositories/types'

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
    Object.values(googleHarness.provider).forEach((mock) => mock.mockReset())
    Object.values(googleHarness.repository).forEach((mock) => mock.mockReset())
    vi.stubGlobal('crypto', { randomUUID: () => 'google-test-id' })
    googleHarness.provider.signIn.mockResolvedValue({
      id: 'account-1',
      email: 'demo@example.com',
      name: 'Demo',
      pictureUrl: null,
    })
    googleHarness.provider.getAccessToken.mockReturnValue('memory-only-token')
    googleHarness.provider.logout.mockResolvedValue(undefined)
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
    googleHarness.provider.logout.mockImplementation(() => new Promise<void>((resolve) => {
      finishRevoke = resolve
    }))
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Googleアカウントで利用する' }))
    expect(await screen.findByText(/4社を読み込みました/)).toBeInTheDocument()
    expect(screen.getByText(/demo@example.com/)).toBeInTheDocument()
    expect(screen.getAllByText('サンプルテック').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'ログアウト' }))

    expect(googleHarness.provider.logout).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { name: '就活の情報を、次の行動へ。' })).toBeInTheDocument()
    expect(screen.queryByText(/demo@example.com/)).not.toBeInTheDocument()
    expect(screen.queryByText('サンプルテック')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Googleアカウントで利用する' })).toBeInTheDocument()

    finishRevoke()
  })

  it('公開入口からデモまたはGoogle本人用を選べる', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('button', { name: 'Googleアカウントで利用する' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'デモを見る' }))
    expect(screen.getByRole('heading', { name: '次に動くことが、ひと目で分かる。' })).toBeInTheDocument()
    expect(googleHarness.provider.signIn).not.toHaveBeenCalled()
  })

  it('401後に未保存変更を保持してユーザー操作で再接続・再保存する', async () => {
    const user = userEvent.setup()
    const initial = createEmptyAppData('2026-08-21T00:00:00.000Z')
    googleHarness.repository.load.mockResolvedValue({
      status: 'loaded', source: 'google-drive', data: initial, version: 'gdrive:v1',
      remoteFile: null, migratedFromV1: false, legacyBackup: null,
    })
    googleHarness.repository.save
      .mockRejectedValueOnce(new StorageRepositoryError('drive-request-failed', '401', { status: 401 }))
      .mockImplementationOnce(async (data) => ({
        status: 'saved', source: 'google-drive', data, version: 'gdrive:v2', remoteFile: null,
      }))

    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Googleアカウントで利用する' }))
    await screen.findByText(/0社を読み込みました/)
    await user.click(screen.getByRole('button', { name: '＋ 企業を登録' }))
    const dialog = screen.getByRole('dialog', { name: '新しい企業を登録' })
    await user.type(within(dialog).getByPlaceholderText('例: 株式会社サンプルテック'), '株式会社架空再接続')
    await user.type(within(dialog).getByPlaceholderText('例: Webエンジニア'), '架空職')
    await user.click(within(dialog).getByRole('button', { name: '企業を登録' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('再接続が必要')
    await user.click(screen.getByRole('button', { name: 'Google Driveへ再接続' }))
    await screen.findByText(/未保存変更を保存しました/)
    expect(googleHarness.provider.signIn).toHaveBeenCalledTimes(2)
    expect(googleHarness.repository.save).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('heading', { name: '株式会社架空再接続' })).toBeInTheDocument()
  })

  it('ログアウト後に別アカウントへ接続しても前アカウントのデータを混在させない', async () => {
    const user = userEvent.setup()
    const accountAData = createDemoAppData()
    const accountBData = createEmptyAppData('2026-08-21T03:00:00.000Z')
    googleHarness.provider.signIn
      .mockResolvedValueOnce({ id: 'account-a', email: 'a@example.com', name: 'A', pictureUrl: null })
      .mockResolvedValueOnce({ id: 'account-b', email: 'b@example.com', name: 'B', pictureUrl: null })
    googleHarness.repository.load
      .mockResolvedValueOnce({ status: 'loaded', source: 'google-drive', data: accountAData, version: 'a:1', remoteFile: null, migratedFromV1: false, legacyBackup: null })
      .mockResolvedValueOnce({ status: 'loaded', source: 'google-drive', data: accountBData, version: 'b:1', remoteFile: null, migratedFromV1: false, legacyBackup: null })

    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Googleアカウントで利用する' }))
    expect(await screen.findByText(/a@example.com/)).toBeInTheDocument()
    expect(screen.getAllByText('サンプルテック').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'ログアウト' }))
    await user.click(screen.getByRole('button', { name: 'Googleアカウントで利用する' }))
    expect(await screen.findByText(/b@example.com/)).toBeInTheDocument()
    expect(screen.queryByText('サンプルテック')).not.toBeInTheDocument()
  })

  it('Driveと端末v2が両方ある場合は自動上書きせず選択肢と更新時刻を表示する', async () => {
    const user = userEvent.setup()
    const local = createDemoAppData()
    localStorage.setItem(V2_STORAGE_KEY, JSON.stringify(local))
    const remote = createEmptyAppData('2026-08-21T04:00:00.000Z')
    googleHarness.repository.load.mockResolvedValue({
      status: 'loaded', source: 'google-drive', data: remote, version: 'remote:1',
      remoteFile: null, migratedFromV1: false, legacyBackup: null,
    })

    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Googleアカウントで利用する' }))
    expect(await screen.findByText('Driveとこの端末の両方にデータがあります')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Google Driveのデータを使用' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'この端末のデータをDriveへ上書き' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'JSONバックアップをダウンロード' })).toBeInTheDocument()
    expect(googleHarness.repository.save).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Google Driveのデータを使用' }))
    await waitFor(() => expect(screen.queryByText('Driveとこの端末の両方にデータがあります')).not.toBeInTheDocument())
    expect(localStorage.getItem(V2_STORAGE_KEY)).toContain('サンプルテック')
  })

  it('Driveが空なら端末v1を検証・退避してからDriveへ移行する', async () => {
    const user = userEvent.setup()
    const raw = JSON.stringify(createDemoCompanies().slice(0, 1))
    localStorage.setItem(V1_STORAGE_KEY, raw)
    googleHarness.repository.load.mockResolvedValue({
      status: 'empty', source: 'google-drive', data: null, version: null,
    })
    googleHarness.repository.save.mockImplementation(async (data) => ({
      status: 'saved', source: 'google-drive', data, version: 'remote:new', remoteFile: null,
    }))

    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Googleアカウントで利用する' }))
    expect(await screen.findByText('この端末の既存データを検出しました')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '移行する' }))
    expect(await screen.findByText(/v1をDriveへ移行しました/)).toBeInTheDocument()
    expect(localStorage.getItem(V1_STORAGE_KEY)).toBe(raw)
    expect(Object.keys(localStorage).some((key) => key.startsWith(V1_BACKUP_PREFIX))).toBe(true)
    expect(googleHarness.repository.save).toHaveBeenCalledTimes(1)
  })

  it('端末v2のDrive移行失敗時は候補と端末原文を保持する', async () => {
    const user = userEvent.setup()
    const local = createDemoAppData()
    const raw = JSON.stringify(local)
    localStorage.setItem(V2_STORAGE_KEY, raw)
    googleHarness.repository.load.mockResolvedValue({
      status: 'empty', source: 'google-drive', data: null, version: null,
    })
    googleHarness.repository.save.mockRejectedValue(new Error('架空のDrive保存失敗'))

    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Googleアカウントで利用する' }))
    await screen.findByText('この端末の既存データを検出しました')
    await user.click(screen.getByRole('button', { name: '移行する' }))

    expect(await screen.findByText('架空のDrive保存失敗')).toBeInTheDocument()
    expect(screen.getByText('この端末の既存データを検出しました')).toBeInTheDocument()
    expect(localStorage.getItem(V2_STORAGE_KEY)).toBe(raw)
  })
})
