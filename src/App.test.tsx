import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { createDemoCompanies } from './data/demoData'
import { createDemoAppData } from './data/demoDataV2'
import { V1_BACKUP_PREFIX, V2_STORAGE_KEY } from './domain/migration'

beforeEach(() => {
  localStorage.clear()
  let sequence = 0
  vi.stubGlobal('crypto', { randomUUID: () => `test-id-${sequence += 1}` })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function backupFile(raw: string): File {
  const file = new File([raw], 'backup.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: async () => raw })
  return file
}

async function addCompany(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: '＋ 企業を登録' }))
  const dialog = screen.getByRole('dialog', { name: '新しい企業を登録' })
  await user.type(within(dialog).getByPlaceholderText('例: 株式会社サンプルテック'), name)
  await user.type(within(dialog).getByPlaceholderText('例: Webエンジニア'), '開発職')
  await user.click(within(dialog).getByRole('button', { name: '企業を登録' }))
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result)))
    reader.addEventListener('error', () => reject(reader.error))
    reader.readAsText(blob)
  })
}

describe('Job Hunt Manager', () => {
  it('公開デモのダッシュボードを表示する', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: '次に動くことが、ひと目で分かる。' })).toBeInTheDocument()
    expect(screen.getAllByText('サンプルテック').length).toBeGreaterThan(0)
    expect(screen.getByText('架空データのみ表示中')).toBeInTheDocument()
  })

  it('検索で企業を絞り込む', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /企業・選考/ }))
    await user.type(screen.getByPlaceholderText('企業名・職種・メモ・調査情報を検索'), 'みらい')

    expect(screen.getByRole('heading', { name: 'みらいデジタル' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'サンプルテック' })).not.toBeInTheDocument()
  })

  it('本人用モードで企業を登録し保存する', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '本人用' }))
    await screen.findByText('保存先は空です。最初の保存で新規作成します。')
    await user.click(screen.getByRole('button', { name: '＋ 企業を登録' }))
    const dialog = screen.getByRole('dialog', { name: '新しい企業を登録' })
    await user.type(within(dialog).getByPlaceholderText('例: 株式会社サンプルテック'), '株式会社テストキャリア')
    await user.type(within(dialog).getByPlaceholderText('例: Webエンジニア'), '開発職')
    await user.click(within(dialog).getByRole('button', { name: '企業を登録' }))

    expect(screen.getByRole('heading', { name: '株式会社テストキャリア' })).toBeInTheDocument()
    await waitFor(() => expect(localStorage.getItem('job-hunt-manager:app-data:v2')).toContain('株式会社テストキャリア'))
  })

  it('企業詳細から選考予定を追加してステータスを表示する', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /企業・選考/ }))
    await user.click(screen.getByRole('heading', { name: 'サンプルテック' }).closest('button')!)
    const dialog = screen.getByRole('dialog', { name: 'サンプルテック' })
    await user.type(within(dialog).getByPlaceholderText('例: 一次面接'), '最終面接')
    await user.type(within(dialog).getByLabelText('日時 必須'), '2026-09-01T10:00')
    await user.click(within(dialog).getByRole('button', { name: '予定を追加' }))

    expect(within(dialog).getByRole('heading', { name: '最終面接' })).toBeInTheDocument()
  })

  it('既存の選考予定を編集して完了へ変更する', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '企業・選考' }))
    await user.click(screen.getByRole('heading', { name: 'サンプルテック' }).closest('button')!)
    const dialog = screen.getByRole('dialog', { name: 'サンプルテック' })
    await user.click(within(dialog).getAllByRole('button', { name: '編集' })[0])
    await user.selectOptions(within(dialog).getByLabelText('状態'), '完了')
    await user.click(within(dialog).getByRole('button', { name: '予定を更新' }))

    expect(within(dialog).getAllByText('完了').length).toBeGreaterThan(0)
  })

  it('競合中はpersonal編集を停止し、demo切替後も状態を保持してlocal案を退避してから再読込する', async () => {
    const user = userEvent.setup()
    const initial = createDemoAppData()
    localStorage.setItem(V2_STORAGE_KEY, JSON.stringify(initial))
    render(<App />)

    await user.click(screen.getByRole('button', { name: '本人用' }))
    await screen.findByText(/4社を読み込みました/)

    const externallyChanged = {
      ...initial,
      revision: initial.revision + 1,
      updatedAt: '2026-08-21T02:00:00.000Z',
    }
    localStorage.setItem(V2_STORAGE_KEY, JSON.stringify(externallyChanged))
    await addCompany(user, '株式会社local退避テスト')

    const conflictAlert = await screen.findByRole('alert')
    expect(within(conflictAlert).getByText(/本人用データの編集を停止/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '＋ 企業を登録' })).toBeDisabled()
    expect(screen.getByLabelText('保存状態 競合')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '公開デモ' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '＋ 企業を登録' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '本人用' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getAllByText(/別のタブ等でローカルデータが変更/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '＋ 企業を登録' })).toBeDisabled()

    const originalCreateObjectUrl = URL.createObjectURL
    const originalRevokeObjectUrl = URL.revokeObjectURL
    let downloadedBlob: Blob | null = null
    const createObjectUrl = vi.fn((blob: Blob) => {
      downloadedBlob = blob
      return 'blob:conflict-backup'
    })
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    try {
      await user.click(screen.getByRole('button', { name: 'local案を退避してremote再読込' }))
      await screen.findByText(/4社を読み込みました/)
      expect(anchorClick).toHaveBeenCalledTimes(1)
      expect(downloadedBlob).not.toBeNull()
      expect(await readBlob(downloadedBlob!)).toContain('株式会社local退避テスト')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: '＋ 企業を登録' })).toBeEnabled()
    } finally {
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreateObjectUrl })
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevokeObjectUrl })
    }
  })

  it('v1 backupをRepositoryでpreview後にcommitし、原文退避と保存成功後のUI反映を行う', async () => {
    const user = userEvent.setup()
    const legacy = createDemoCompanies().slice(0, 1)
    const raw = JSON.stringify(legacy)
    render(<App />)

    await user.click(screen.getByRole('button', { name: '本人用' }))
    await screen.findByText('保存先は空です。最初の保存で新規作成します。')
    await user.click(screen.getByRole('button', { name: 'データ管理' }))
    await user.upload(screen.getByLabelText('JSONを選ぶ'), backupFile(raw))

    expect(await screen.findByRole('heading', { name: '取り込み前の確認' })).toBeInTheDocument()
    expect(screen.getByText(/現在: 0社 → 取込後: 1社/)).toBeInTheDocument()
    expect(screen.getByText(/このブラウザーのlocalStorageへlegacy backupとして退避/)).toBeInTheDocument()
    expect(localStorage.getItem(V2_STORAGE_KEY)).toBeNull()

    await user.click(screen.getByRole('button', { name: 'この内容を反映' }))
    expect(await screen.findByText('1社を取り込み、保存先への反映が完了しました。')).toBeInTheDocument()

    const saved = JSON.parse(localStorage.getItem(V2_STORAGE_KEY) ?? '{}') as { userCompanies?: Array<{ id: string }> }
    expect(saved.userCompanies?.[0].id).toBe(legacy[0].id)
    const legacyBackupKeys = Object.keys(localStorage).filter((key) => key.startsWith(V1_BACKUP_PREFIX))
    expect(legacyBackupKeys).toHaveLength(1)
    expect(localStorage.getItem(legacyBackupKeys[0])).toBe(raw)
  })

  it('backup commitが競合した場合はUI stateを置換せずpreviewとv1原文退避を残す', async () => {
    const user = userEvent.setup()
    const initial = createDemoAppData()
    const legacyRaw = JSON.stringify(createDemoCompanies().slice(0, 1))
    localStorage.setItem(V2_STORAGE_KEY, JSON.stringify(initial))
    render(<App />)

    await user.click(screen.getByRole('button', { name: '本人用' }))
    await screen.findByText(/4社を読み込みました/)
    await user.click(screen.getByRole('button', { name: 'データ管理' }))
    await user.upload(screen.getByLabelText('JSONを選ぶ'), backupFile(legacyRaw))
    await screen.findByRole('heading', { name: '取り込み前の確認' })

    const externallyChanged = {
      ...initial,
      revision: initial.revision + 1,
      updatedAt: '2026-08-21T03:00:00.000Z',
    }
    localStorage.setItem(V2_STORAGE_KEY, JSON.stringify(externallyChanged))
    await user.click(screen.getByRole('button', { name: 'この内容を反映' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('本人用データの編集を停止しました')
    expect(screen.getByRole('heading', { name: '取り込み前の確認' })).toBeInTheDocument()
    expect(screen.getByText(/現在: 4社 → 取込後: 1社/)).toBeInTheDocument()
    expect(screen.queryByText(/保存先への反映が完了/)).not.toBeInTheDocument()
    const stored = JSON.parse(localStorage.getItem(V2_STORAGE_KEY) ?? '{}') as { userCompanies?: unknown[] }
    expect(stored.userCompanies).toHaveLength(4)
    const legacyBackupKeys = Object.keys(localStorage).filter((key) => key.startsWith(V1_BACKUP_PREFIX))
    expect(legacyBackupKeys).toHaveLength(1)
    expect(localStorage.getItem(legacyBackupKeys[0])).toBe(legacyRaw)
  })
})
