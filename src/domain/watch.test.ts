import { describe, expect, it } from 'vitest'
import type { UserCompany, WatchFinding } from './types'
import {
  buildTodayActions,
  sortTodayActions,
  updateWatchFindingStatus,
  upsertWatchFinding,
  type TodayAction,
} from './watch'

const NOW = '2026-08-21T00:00:00.000Z'

function finding(overrides: Partial<WatchFinding> = {}): WatchFinding {
  return {
    id: 'finding_1',
    userCompanyId: 'uc_1',
    masterCompanyId: null,
    watchRunId: null,
    type: 'application_deadline',
    severity: 'high',
    title: '架空応募締切',
    summary: '架空の締切です。',
    detectedAt: NOW,
    deadline: '2026-08-22T00:00:00.000Z',
    source: null,
    status: 'new',
    fingerprint: 'fp_deadline_1',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function company(): UserCompany {
  return {
    id: 'uc_1',
    masterCompanyId: null,
    userEnteredName: '架空テック',
    role: '',
    applicationCategory: '',
    manualPriority: 'B',
    interest: 3,
    applicationStatus: '面接待ち',
    myPageStatus: '開設済み',
    applicationUrl: '',
    memo: '',
    watchEnabled: true,
    events: [
      {
        id: 'event_due',
        type: '面接',
        title: '架空面接',
        scheduledAt: '2026-08-22T12:00:00.000Z',
        status: '予定',
        location: '',
        memo: '',
      },
      {
        id: 'event_done',
        type: 'ES',
        title: '完了済みES',
        scheduledAt: '2026-08-21T03:00:00.000Z',
        status: '完了',
        location: '',
        memo: '',
      },
    ],
    createdAt: NOW,
    updatedAt: NOW,
  }
}

describe('Watch Finding', () => {
  it('deduplicates by fingerprint and never reopens a completed Finding', () => {
    const completed = finding({ status: 'completed' })
    const incoming = finding({
      id: 'new_generated_id',
      status: 'new',
      summary: '締切時刻が更新されました。',
      deadline: '2026-08-22T06:00:00.000Z',
    })

    const result = upsertWatchFinding([completed], incoming, '2026-08-21T01:00:00.000Z')

    expect(result.action).toBe('updated')
    expect(result.findings).toHaveLength(1)
    expect(result.finding.id).toBe('finding_1')
    expect(result.finding.status).toBe('completed')
    expect(result.finding.deadline).toBe('2026-08-22T06:00:00.000Z')
  })

  it('keeps state immutable when changing status', () => {
    const original = [finding()]
    const updated = updateWatchFindingStatus(
      original,
      'finding_1',
      'seen',
      '2026-08-21T02:00:00.000Z',
    )

    expect(original[0].status).toBe('new')
    expect(updated[0].status).toBe('seen')
    expect(updated[0].updatedAt).toBe('2026-08-21T02:00:00.000Z')
    expect(() => updateWatchFindingStatus(original, 'missing', 'seen')).toThrow(
      'Watch Findingが見つかりません',
    )
  })
})

describe('transparent today-action ordering', () => {
  it('sorts by deadline band, severity, score, company name, then id', () => {
    const actions: TodayAction[] = [
      {
        id: 'no-deadline-high',
        source: 'watch_finding',
        userCompanyId: 'uc_5',
        companyName: '架空E社',
        title: '重要な確認',
        deadline: null,
        severity: 'high',
        companyScore: 99,
      },
      {
        id: 'three-days',
        source: 'watch_finding',
        userCompanyId: 'uc_3',
        companyName: '架空C社',
        title: '3日以内',
        deadline: '2026-08-23T12:00:00.000Z',
        severity: 'high',
        companyScore: 60,
      },
      {
        id: 'overdue',
        source: 'selection_event',
        userCompanyId: 'uc_1',
        companyName: '架空A社',
        title: '期限超過',
        deadline: '2026-08-20T23:59:59.000Z',
        severity: 'low',
        companyScore: 10,
      },
      {
        id: 'one-day-low-score',
        source: 'selection_event',
        userCompanyId: 'uc_2',
        companyName: '架空B社',
        title: '24時間以内',
        deadline: '2026-08-21T12:00:00.000Z',
        severity: 'medium',
        companyScore: 50,
      },
      {
        id: 'one-day-high-score',
        source: 'selection_event',
        userCompanyId: 'uc_4',
        companyName: '架空D社',
        title: '24時間以内・高得点',
        deadline: '2026-08-21T18:00:00.000Z',
        severity: 'medium',
        companyScore: 90,
      },
    ]

    const ranked = sortTodayActions(actions, NOW)

    expect(ranked.map((action) => action.id)).toEqual([
      'overdue',
      'one-day-high-score',
      'one-day-low-score',
      'three-days',
      'no-deadline-high',
    ])
    expect(ranked.map((action) => action.reason)).toEqual([
      '期限超過',
      '24時間以内',
      '24時間以内',
      '3日以内',
      '重要度 high',
    ])
  })

  it('combines active selection events and Watch Findings while excluding completed items', () => {
    const actions = buildTodayActions(
      [company()],
      [
        finding({ id: 'watch_open', deadline: null, severity: 'high' }),
        finding({ id: 'watch_done', fingerprint: 'fp_done', status: 'completed' }),
      ],
      { now: NOW, companyScores: { uc_1: 80 } },
    )

    expect(actions.map((action) => action.id)).toEqual([
      'selection:uc_1:event_due',
      'watch:watch_open',
    ])
    expect(actions.every((action) => action.companyScore === 80)).toBe(true)
  })
})
