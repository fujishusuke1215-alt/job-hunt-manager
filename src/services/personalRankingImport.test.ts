import { describe, expect, it } from 'vitest'
import { createEmptyAppData } from '../domain/migration'
import { rankCompanyViews } from '../domain/selectors'
import { getCompanyViews } from '../domain/selectors'
import type { UserCompany } from '../domain/types'
import {
  addRankingOnlyCompanies,
  applyPersonalRankingImport,
  createPersonalRankingProfile,
  reconcilePersonalRankingRows,
  verifyPersonalRanking,
  type PersonalRankingRow,
} from './personalRankingImport'

const now = '2026-08-26T00:00:00.000Z'
const company = (id: string, name: string): UserCompany => ({
  id,
  masterCompanyId: null,
  userEnteredName: name,
  role: '',
  applicationCategory: '',
  manualPriority: 'C',
  interest: 0,
  applicationStatus: '検討中',
  myPageStatus: '未開設',
  applicationUrl: '',
  selectionPhase: 'considering',
  selectionState: 'active',
  closeReason: null,
  offerDecision: null,
  selectionStageUpdatedAt: now,
  lastCompanyInteractionAt: null,
  memo: '',
  watchEnabled: true,
  events: [],
  createdAt: now,
  updatedAt: now,
})

const row = (overrides: Partial<PersonalRankingRow> = {}): PersonalRankingRow => ({
  rank: 1,
  companyName: 'パナソニック コネクト',
  salaryGrowth: 17.5,
  wlb: 23.5,
  remoteFlex: 15,
  itDxFit: 10,
  overseasSea: 5.5,
  offerRealism: 6,
  stabilityLocation: 9,
  rawScore: 86.5,
  totalScore: 91.1,
  confidence: 'A',
  previousRank: 1,
  previousTotalScore: 91.3,
  populationStatus: 'テスト',
  researchComment: '',
  sourceUrl: null,
  ...overrides,
})

function seed() {
  const data = createEmptyAppData(now)
  data.userCompanies = [company('connect', 'パナソニック コネクト'), company('jri', '日本総合研究所（JRI）')]
  return data
}

describe('personal ranking import', () => {
  it('Excelの配点済み値を二重加重せず91.1点へ再現する', () => {
    const data = seed()
    const matches = reconcilePersonalRankingRows([row()], data.userCompanies)
    const next = applyPersonalRankingImport(data, matches, now)
    const result = verifyPersonalRanking(matches, next)[0]

    expect(createPersonalRankingProfile(now).criteria.map((item) => item.weight)).toEqual([20, 25, 15, 10, 7, 8, 10])
    expect(result.appTotal).toBe(91.1)
    expect(result.appRaw).toBeCloseTo(86.5, 8)
    expect(result.scoreDifference).toBe(0)
  })

  it('括弧表記をaliasとして一意に対応し、曖昧な候補は拒否する', () => {
    const data = seed()
    const alias = reconcilePersonalRankingRows([row({ companyName: '日本総合研究所' })], data.userCompanies)
    const ambiguous = reconcilePersonalRankingRows([row({ companyName: '同名企業' })], [company('a', '同名企業'), company('b', '同名企業')])

    expect(alias[0].status).toBe('alias')
    expect(alias[0].userCompany?.id).toBe('jri')
    expect(ambiguous[0].status).toBe('ambiguous')
  })

  it('DBにないExcel企業は監視を有効化せずranking-onlyとして追加する', () => {
    const data = seed()
    const missing = reconcilePersonalRankingRows([row({ companyName: '架空ランキング企業', sourceUrl: 'https://example.invalid/recruit' })], data.userCompanies)
    const augmented = addRankingOnlyCompanies(data, missing, now)

    expect(augmented.userCompanies).toHaveLength(3)
    expect(augmented.userCompanies[2]).toMatchObject({ userEnteredName: '架空ランキング企業', watchEnabled: false, events: [] })
  })

  it('同点はExcel sourceRankで安定して順位を再現する', () => {
    const data = seed()
    const rows = [row({ rank: 2, companyName: 'パナソニック コネクト' }), row({ rank: 1, companyName: '日本総合研究所（JRI）' })]
    const matches = reconcilePersonalRankingRows(rows, data.userCompanies)
    const next = applyPersonalRankingImport(data, matches, now)
    const views = getCompanyViews(next, { schemaVersion: 1, masterCompanies: [], updatedAt: now })

    expect(rankCompanyViews(views).slice(0, 2).map((item) => item.rank)).toEqual([1, 2])
    expect(rankCompanyViews(views).slice(0, 2).map((item) => item.company.userEnteredName)).toEqual(['日本総合研究所（JRI）', 'パナソニック コネクト'])
  })

  it('再importしても評価を重複せず、選考とFindingを保持する', () => {
    const data = seed()
    data.userCompanies[0].events = [{ id: 'event', type: 'ES', title: '保持', scheduledAt: now, status: '予定', location: '', memo: '' }]
    data.watchFindings = [{ id: 'finding', userCompanyId: 'connect', masterCompanyId: null, watchRunId: null, type: 'other', severity: 'low', title: '保持', summary: '', detectedAt: now, deadline: null, source: null, status: 'new', fingerprint: 'keep', createdAt: now, updatedAt: now }]
    const matches = reconcilePersonalRankingRows([row()], data.userCompanies)
    const first = applyPersonalRankingImport(data, matches, now)
    const second = applyPersonalRankingImport(first, matches, '2026-08-26T01:00:00.000Z')

    expect(second.evaluations.filter((item) => item.scoringProfileId === second.activeScoringProfileId)).toHaveLength(1)
    expect(second.userCompanies[0].events).toHaveLength(1)
    expect(second.watchFindings).toHaveLength(1)
  })
})
