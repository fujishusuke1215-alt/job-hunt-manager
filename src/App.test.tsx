import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

beforeEach(() => {
  vi.stubGlobal('crypto', { randomUUID: () => 'test-company-id' })
})

describe('Job Hunt Manager', () => {
  it('公開デモのダッシュボードを表示する', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: '次に動くことが、ひと目で分かる。' })).toBeInTheDocument()
    expect(screen.getAllByText('株式会社サンプルテック').length).toBeGreaterThan(0)
    expect(screen.getByText('架空データのみ表示中')).toBeInTheDocument()
  })

  it('検索で企業を絞り込む', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /企業・選考管理/ }))
    await user.type(screen.getByPlaceholderText('企業名・職種・メモを検索'), 'みらい')

    expect(screen.getByRole('heading', { name: 'みらいデジタル株式会社' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '株式会社サンプルテック' })).not.toBeInTheDocument()
  })

  it('本人用モードで企業を登録し保存する', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '本人用' }))
    await user.click(screen.getByRole('button', { name: '＋ 企業を登録' }))
    const dialog = screen.getByRole('dialog', { name: '新しい企業を登録' })
    await user.type(within(dialog).getByPlaceholderText('例: 株式会社サンプルA'), '株式会社テストキャリア')
    await user.type(within(dialog).getByPlaceholderText('例: Webエンジニア'), '開発職')
    await user.click(within(dialog).getByRole('button', { name: '企業を登録' }))

    expect(screen.getByRole('heading', { name: '株式会社テストキャリア' })).toBeInTheDocument()
    expect(localStorage.getItem('job-hunt-manager:personal-companies:v1')).toContain('株式会社テストキャリア')
  })

  it('企業詳細から選考予定を追加してステータスを表示する', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /企業・選考管理/ }))
    await user.click(screen.getByRole('heading', { name: '株式会社サンプルテック' }).closest('button')!)
    const dialog = screen.getByRole('dialog', { name: '株式会社サンプルテック' })
    await user.type(within(dialog).getByPlaceholderText('例: 一次面接'), '最終面接')
    await user.type(within(dialog).getByLabelText('日時 必須'), '2026-09-01T10:00')
    await user.click(within(dialog).getByRole('button', { name: '予定を追加' }))

    expect(within(dialog).getByRole('heading', { name: '最終面接' })).toBeInTheDocument()
  })

  it('既存の選考予定を編集して完了へ変更する', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '企業・選考管理' }))
    await user.click(screen.getByRole('heading', { name: '株式会社サンプルテック' }).closest('button')!)
    const dialog = screen.getByRole('dialog', { name: '株式会社サンプルテック' })
    await user.click(within(dialog).getAllByRole('button', { name: '編集' })[0])
    await user.selectOptions(within(dialog).getByLabelText('状態'), '完了')
    await user.click(within(dialog).getByRole('button', { name: '予定を更新' }))

    expect(within(dialog).getAllByText('完了').length).toBeGreaterThan(0)
  })
})
