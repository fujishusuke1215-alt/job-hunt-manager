import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { demoCatalog } from '../data/catalogData'
import { createDemoAppData } from '../data/demoDataV2'
import { getActiveScoringProfile, getCompanyViews } from '../domain/selectors'
import type { WatchFinding } from '../domain/types'
import { CompanyDetail } from './CompanyDetail'
import { Dashboard } from './Dashboard'

function dataWithCurrentAndHistory() {
  const data = createDemoAppData()
  data.userCompanies[0] = {
    ...data.userCompanies[0],
    events: [
      { ...data.userCompanies[0].events[0], status: '結果待ち' },
      ...data.userCompanies[0].events.slice(1),
      { ...data.userCompanies[0].events[0], id: 'dismissed-event', title: '見送り済み', status: '見送り' },
    ],
  }
  return data
}

function finding(): WatchFinding {
  return {
    id: 'watch-todo', userCompanyId: 'demo-company-1', masterCompanyId: null, watchRunId: null,
    type: 'application_deadline', severity: 'high', title: 'Watch の締切確認', summary: '',
    detectedAt: '2026-08-21T00:00:00.000Z', deadline: '2026-08-22T00:00:00.000Z', source: null,
    status: 'seen', fingerprint: 'watch-todo', createdAt: '2026-08-21T00:00:00.000Z', updatedAt: '2026-08-21T00:00:00.000Z',
  }
}

describe('Todo actions', () => {
  it('uses the circular control for selection completion without opening the company, and preserves the previous status for Undo', async () => {
    const user = userEvent.setup()
    const data = dataWithCurrentAndHistory()
    const views = getCompanyViews(data, demoCatalog)
    const onCompleteAction = vi.fn()
    const onUndoAction = vi.fn()
    const onOpenAction = vi.fn()
    render(<Dashboard companies={views} findings={[]} onOpenCompany={vi.fn()} onAddCompany={vi.fn()} onOpenWatch={vi.fn()} onOpenAction={onOpenAction} onCompleteAction={onCompleteAction} onUndoAction={onUndoAction} />)

    await user.click(screen.getByRole('button', { name: /サンプルテック.*実装課題の提出を完了にする/ }))
    expect(onCompleteAction).toHaveBeenCalledWith(expect.objectContaining({ source: 'selection_event', status: '結果待ち' }))
    expect(onOpenAction).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /実装課題の提出 を戻す/ }))
    expect(onUndoAction).toHaveBeenCalledWith(expect.objectContaining({ source: 'selection_event', status: '結果待ち' }))
  })

  it('uses the same circular control for Watch Findings without opening a detail', async () => {
    const user = userEvent.setup()
    const data = createDemoAppData()
    const onCompleteAction = vi.fn()
    const onOpenAction = vi.fn()
    render(<Dashboard companies={getCompanyViews(data, demoCatalog)} findings={[finding()]} onOpenCompany={vi.fn()} onAddCompany={vi.fn()} onOpenWatch={vi.fn()} onOpenAction={onOpenAction} onCompleteAction={onCompleteAction} />)

    await user.click(screen.getByRole('button', { name: /Watch の締切確認を完了にする/ }))
    expect(onCompleteAction).toHaveBeenCalledWith(expect.objectContaining({ source: 'watch_finding', watchFindingId: 'watch-todo', status: 'seen' }))
    expect(onOpenAction).not.toHaveBeenCalled()
  })

  it('places current Todos before application and evaluation, and completes them from Company Detail', async () => {
    const user = userEvent.setup()
    const data = dataWithCurrentAndHistory()
    const view = getCompanyViews(data, demoCatalog)[0]
    const onUpdateEvents = vi.fn()
    const { container } = render(<CompanyDetail view={view} profile={getActiveScoringProfile(data)} onClose={vi.fn()} onEdit={vi.fn()} onUpdateEvents={onUpdateEvents} onSaveFact={vi.fn()} highlightedEventId={view.company.events[0].id} />)

    const html = container.innerHTML
    expect(html.indexOf('現在の選考・予定')).toBeLessThan(html.indexOf('応募情報'))
    expect(html.indexOf('現在の選考・予定')).toBeLessThan(html.indexOf('評価内訳'))
    expect(screen.getAllByText('結果待ち').length).toBeGreaterThan(0)
    expect(screen.queryByText('見送り済み')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '実装課題の提出を完了にする' }))
    expect(onUpdateEvents).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: view.company.events[0].id, status: '完了' })]))
  })
})
