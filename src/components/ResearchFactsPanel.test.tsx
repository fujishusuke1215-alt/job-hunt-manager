import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ResearchFact } from '../domain/types'
import { ResearchFactsPanel } from './ResearchFactsPanel'

const fact: ResearchFact = {
  id: 'fact_test',
  userCompanyId: 'company_test',
  masterCompanyId: 'master_test',
  key: 'eligibility',
  label: '応募資格',
  value: '応募可能',
  recruitingCycle: '2028卒',
  roleScope: '技術職',
  checkedAt: '2026-08-21T00:00:00.000Z',
  verificationLevel: 'official_confirmed',
  reviewStatus: 'confirmed',
  processedByAi: true,
  sources: [
    {
      id: 'source_primary',
      type: 'official_web',
      title: '公式採用情報',
      url: 'https://example.test/recruit',
      retrievedAt: '2026-08-21T00:00:00.000Z',
      publishedAt: null,
      note: '募集要項を確認',
    },
    {
      id: 'source_secondary',
      type: 'user',
      title: '確認メモ',
      url: null,
      retrievedAt: null,
      publishedAt: null,
      note: '',
    },
  ],
  createdAt: '2026-08-20T00:00:00.000Z',
  updatedAt: '2026-08-21T00:00:00.000Z',
}

describe('ResearchFactsPanel', () => {
  it('注意文、確認情報、AI整理、根拠を日本語で表示する', async () => {
    const user = userEvent.setup()
    render(
      <ResearchFactsPanel
        facts={[fact]}
        userCompanyId="company_test"
        masterCompanyId="master_test"
        onSave={vi.fn()}
      />,
    )

    expect(screen.getByText('情報は最終確認時点のもので、変更される可能性があります。応募前に公式情報を確認してください。')).toBeInTheDocument()
    const card = screen.getByRole('article', { name: '調査情報: 応募資格' })
    expect(within(card).getByText('応募可能')).toBeInTheDocument()
    expect(within(card).getByText('公式確認済み')).toBeInTheDocument()
    expect(within(card).getByText('確認済み')).toBeInTheDocument()
    expect(within(card).getByText('2028卒')).toBeInTheDocument()
    expect(within(card).getByText('あり')).toBeInTheDocument()

    await user.click(within(card).getByText('根拠を見る'))
    expect(within(card).getByText('公式採用情報')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: '出典を開く ↗' })).toHaveAttribute('href', 'https://example.test/recruit')
  })

  it('新規情報を安全な出典URLと関連ID付きで保存する', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(
      <ResearchFactsPanel
        facts={[]}
        userCompanyId="company_new"
        masterCompanyId="master_new"
        onSave={onSave}
      />,
    )

    await user.type(screen.getByLabelText(/項目名/), '選考方式')
    await user.type(screen.getByLabelText(/管理キー/), 'selection_method')
    await user.type(screen.getByLabelText('値'), 'オンライン')
    await user.type(screen.getByLabelText('対象年度'), '2028卒')
    await user.selectOptions(screen.getByLabelText('確認レベル'), 'official_interpreted')
    await user.selectOptions(screen.getByLabelText('確認状態'), 'confirmed')
    await user.click(screen.getByLabelText('AIが整理した情報'))
    await user.selectOptions(screen.getByLabelText('出典種別'), 'official_web')
    await user.type(screen.getByLabelText('出典タイトル'), '公式案内')
    await user.type(screen.getByLabelText(/出典URL/), 'https://example.test/selection')
    fireEvent.change(screen.getByLabelText('最終確認日'), { target: { value: '2026-08-21T09:30' } })
    await user.click(screen.getByRole('button', { name: '情報を追加' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    const saved = onSave.mock.calls[0][0] as ResearchFact
    expect(saved).toMatchObject({
      userCompanyId: 'company_new',
      masterCompanyId: 'master_new',
      label: '選考方式',
      key: 'selection_method',
      value: 'オンライン',
      verificationLevel: 'official_interpreted',
      reviewStatus: 'confirmed',
      processedByAi: true,
    })
    expect(saved.id).not.toBe('')
    expect(saved.checkedAt).not.toBeNull()
    expect(saved.sources[0]).toMatchObject({
      type: 'official_web',
      title: '公式案内',
      url: 'https://example.test/selection',
    })
    expect(saved.sources[0].id).not.toBe('')
  })

  it('http/https以外の出典URLを拒否しonSaveを呼ばない', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(
      <ResearchFactsPanel
        facts={[]}
        userCompanyId="company_test"
        masterCompanyId={null}
        onSave={onSave}
      />,
    )

    await user.type(screen.getByLabelText(/項目名/), '確認項目')
    await user.type(screen.getByLabelText(/管理キー/), 'unsafe_url_test')
    await user.type(screen.getByLabelText(/出典URL/), 'javascript:alert(1)')
    await user.click(screen.getByRole('button', { name: '情報を追加' }))

    expect(screen.getByRole('alert')).toHaveTextContent('httpまたはhttps')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('編集時はFact ID・作成日・編集対象外の出典を保持する', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(
      <ResearchFactsPanel
        facts={[fact]}
        userCompanyId="company_test"
        masterCompanyId="master_test"
        onSave={onSave}
      />,
    )

    await user.click(screen.getByRole('button', { name: '応募資格を編集' }))
    const label = screen.getByLabelText(/項目名/)
    await user.clear(label)
    await user.type(label, '応募条件')
    await user.click(screen.getByRole('button', { name: '変更を保存' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    const saved = onSave.mock.calls[0][0] as ResearchFact
    expect(saved.id).toBe(fact.id)
    expect(saved.createdAt).toBe(fact.createdAt)
    expect(saved.label).toBe('応募条件')
    expect(saved.sources[0].id).toBe('source_primary')
    expect(saved.sources[1]).toEqual(fact.sources[1])
  })
})
