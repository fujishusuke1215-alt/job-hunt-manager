import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CompanyView, UserCompany, WatchFinding, WatchRun } from '../domain/types'
import { WatchCenter } from './WatchCenter'

const NOW = '2026-08-21T00:00:00.000Z'

function userCompany(id: string, name: string, watchEnabled = true): UserCompany {
  return {
    id,
    masterCompanyId: null,
    userEnteredName: name,
    role: '架空職',
    applicationCategory: '新卒',
    manualPriority: 'B',
    interest: 3,
    applicationStatus: '検討中',
    myPageStatus: '未開設',
    applicationUrl: '',
    memo: 'テスト専用の架空データ',
    watchEnabled,
    events: [],
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function companyView(id: string, name: string, score: number, watchEnabled = true): CompanyView {
  return {
    company: userCompany(id, name, watchEnabled),
    displayName: name,
    master: null,
    facts: [],
    evaluation: null,
    score: {
      score,
      coverage: 100,
      evaluatedWeight: 100,
      enabledWeight: 100,
      provisional: false,
    },
  }
}

function finding(
  id: string,
  userCompanyId: string,
  title: string,
  status: WatchFinding['status'],
  severity: WatchFinding['severity'],
): WatchFinding {
  return {
    id,
    userCompanyId,
    masterCompanyId: null,
    watchRunId: 'run_fictional',
    type: 'recruitment_info_changed',
    severity,
    title,
    summary: `${title}の完全な架空情報です。`,
    detectedAt: NOW,
    deadline: status === 'completed' ? null : '2026-08-23T00:00:00.000Z',
    source: null,
    status,
    fingerprint: `fingerprint_${id}`,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

const companies = [
  companyView('uc_fictional_alpha', '架空アルファ株式会社', 80),
  companyView('uc_fictional_beta', '架空ベータ株式会社', 70),
  companyView('uc_fictional_disabled', '架空Watch無効株式会社', 60, false),
]

const findings = [
  finding('finding_new', 'uc_fictional_alpha', '架空募集開始', 'new', 'high'),
  finding('finding_seen', 'uc_fictional_beta', '架空締切変更', 'seen', 'medium'),
  finding('finding_completed', 'uc_fictional_alpha', '架空確認完了', 'completed', 'low'),
  finding('finding_dismissed', 'uc_fictional_alpha', '架空非表示済み', 'dismissed', 'low'),
  finding('finding_disabled', 'uc_fictional_disabled', '架空Watch無効通知', 'new', 'high'),
]

const runs: WatchRun[] = [
  {
    id: 'run_fictional',
    provider: 'manual-fictional-ai',
    startedAt: '2026-08-21T00:00:00.000Z',
    completedAt: '2026-08-21T00:01:00.000Z',
    findingCount: 3,
    status: 'completed',
    note: '完全な架空データ',
  },
]

describe('WatchCenter', () => {
  it('new・要対応・完了の集計、自動巡回未実装の説明、status callbackを表示する', async () => {
    const user = userEvent.setup()
    const onStatusChange = vi.fn()
    const onOpenCompany = vi.fn()
    render(
      <WatchCenter
        companies={companies}
        findings={findings}
        runs={runs}
        onStatusChange={onStatusChange}
        onOpenCompany={onOpenCompany}
      />,
    )

    const newMetric = screen.getByText('新しい発見').closest('article')
    const actionMetric = screen.getByText('要対応').closest('article')
    const completedMetric = screen.getByText('完了', { selector: '.metric-card > span' }).closest('article')
    expect(within(newMetric!).getByText('1')).toBeInTheDocument()
    expect(within(actionMetric!).getByText('2')).toBeInTheDocument()
    expect(within(completedMetric!).getByText('1')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('現在は手動AI JSON取込だけです')
    expect(screen.getByRole('note')).toHaveTextContent(
      'Gmailや採用Webの自動巡回、バックグラウンド定期実行はまだありません',
    )
    expect(screen.queryByRole('heading', { name: '架空非表示済み' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '架空Watch無効通知' })).not.toBeInTheDocument()

    const newCard = screen.getByRole('heading', { name: '架空募集開始' }).closest('article')
    await user.click(within(newCard!).getByRole('button', { name: '完了' }))
    expect(onStatusChange).toHaveBeenCalledWith('finding_new', 'completed')

    await user.click(within(newCard!).getByRole('button', { name: '架空アルファ株式会社' }))
    expect(onOpenCompany).toHaveBeenCalledWith('uc_fictional_alpha')
  })

  it('状態・重要度・企業フィルターで表示対象を絞り込む', async () => {
    const user = userEvent.setup()
    render(
      <WatchCenter
        companies={companies}
        findings={findings}
        runs={runs}
        onStatusChange={vi.fn()}
        onOpenCompany={vi.fn()}
      />,
    )

    await user.selectOptions(screen.getByLabelText('状態'), 'completed')
    expect(screen.getByRole('heading', { name: '架空確認完了' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '架空募集開始' })).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('状態'), 'all')
    await user.selectOptions(screen.getByLabelText('重要度'), 'high')
    expect(screen.getByRole('heading', { name: '架空募集開始' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '架空締切変更' })).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('重要度'), 'all')
    await user.selectOptions(screen.getByLabelText('企業'), 'uc_fictional_beta')
    expect(screen.getByRole('heading', { name: '架空締切変更' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '架空確認完了' })).not.toBeInTheDocument()
  })

  it('dismissedは通常一覧から隠し、状態で明示選択したときだけ表示する', async () => {
    const user = userEvent.setup()
    render(
      <WatchCenter
        companies={companies}
        findings={findings}
        runs={runs}
        onStatusChange={vi.fn()}
        onOpenCompany={vi.fn()}
      />,
    )

    expect(screen.queryByRole('heading', { name: '架空非表示済み' })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('状態'), 'dismissed')
    expect(screen.getByRole('heading', { name: '架空非表示済み' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '架空Watch無効通知' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '架空Watch無効株式会社' })).not.toBeInTheDocument()
  })
})
