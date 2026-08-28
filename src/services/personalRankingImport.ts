import { normalizeCompanyName } from '../domain/companyMatching'
import { calculateScore } from '../domain/scoring'
import type { AppDataV2, CompanyEvaluation, Criterion, ScoringProfile, UserCompany } from '../domain/types'
import { createId } from '../utils/id'

export const PERSONAL_RANKING_PROFILE_ID = 'profile_personal_ranking_2026_08_26'
export const PERSONAL_RANKING_SOURCE = '2026-08-26_就活企業ランキング91社_再調査版.xlsx'
export const PERSONAL_RANKING_AS_OF = '2026-08-26'

export interface PersonalRankingRow {
  rank: number
  companyName: string
  salaryGrowth: number
  wlb: number
  remoteFlex: number
  itDxFit: number
  overseasSea: number
  offerRealism: number
  stabilityLocation: number
  rawScore: number
  totalScore: number
  confidence: string
  previousRank: number | null
  previousTotalScore: number | null
  populationStatus: string
  researchComment: string
  sourceUrl: string | null
}

export interface RankingNameMatch {
  row: PersonalRankingRow
  status: 'exact' | 'alias' | 'ranking_only' | 'unresolved' | 'ambiguous'
  userCompany: UserCompany | null
  candidates: UserCompany[]
}

const criterion = (id: string, label: string, weight: number, order: number): Criterion => ({
  id,
  label,
  description: `${label}をExcelの配点済み点数から正規化して保存します。`,
  scaleMax: 10,
  weight,
  enabled: true,
  order,
})

export function createPersonalRankingProfile(now: string): ScoringProfile {
  return {
    id: PERSONAL_RANKING_PROFILE_ID,
    name: '2026-08-26 個人ランキング',
    kind: 'custom',
    criteria: [
      criterion('personal_salary_growth', '給与・伸び', 20, 0),
      criterion('personal_wlb', 'WLB', 25, 1),
      criterion('personal_remote_flex', 'リモート・フレックス', 15, 2),
      criterion('personal_it_dx_fit', 'IT/DX一致', 10, 3),
      criterion('personal_overseas_sea', '海外・東南アジア', 7, 4),
      criterion('personal_offer_realism', '内定現実性', 8, 5),
      criterion('personal_stability_location', '安定性・勤務地', 10, 6),
    ],
    createdAt: now,
    updatedAt: now,
  }
}

const rowScores = (row: PersonalRankingRow) => [
  row.salaryGrowth / 20 * 10,
  row.wlb / 25 * 10,
  row.remoteFlex / 15 * 10,
  row.itDxFit / 10 * 10,
  row.overseasSea / 7 * 10,
  row.offerRealism / 8 * 10,
  row.stabilityLocation / 10 * 10,
]

export function rankingValues(row: PersonalRankingRow): Record<string, number> {
  const values = rowScores(row)
  return {
    personal_salary_growth: values[0],
    personal_wlb: values[1],
    personal_remote_flex: values[2],
    personal_it_dx_fit: values[3],
    personal_overseas_sea: values[4],
    personal_offer_realism: values[5],
    personal_stability_location: values[6],
  }
}

function indexNames(companies: readonly UserCompany[], aliasesById: ReadonlyMap<string, readonly string[]>) {
  const index = new Map<string, UserCompany[]>()
  const add = (name: string, company: UserCompany) => {
    const keys = [normalizeCompanyName(name), normalizeRankingName(name)]
    keys.filter(Boolean).forEach((key) => index.set(key, [...(index.get(key) ?? []), company]))
  }
  companies.forEach((company) => {
    add(company.userEnteredName, company)
    ;(aliasesById.get(company.id) ?? []).forEach((alias) => add(alias, company))
  })
  return index
}

function normalizeRankingName(value: string): string {
  return normalizeCompanyName(value).replace(/[（(][^）)]*[）)]/g, '').replace(/[・･・－―‐-]/g, '').replace(/\s+/g, '')
}

export function reconcilePersonalRankingRows(
  rows: readonly PersonalRankingRow[],
  companies: readonly UserCompany[],
  aliasesById: ReadonlyMap<string, readonly string[]> = new Map(),
): RankingNameMatch[] {
  const exact = new Map<string, UserCompany[]>()
  companies.forEach((company) => {
    const key = normalizeCompanyName(company.userEnteredName)
    exact.set(key, [...(exact.get(key) ?? []), company])
  })
  const index = indexNames(companies, aliasesById)
  return rows.map((row) => {
    const key = normalizeCompanyName(row.companyName)
    const direct = exact.get(key) ?? []
    if (direct.length === 1) return { row, status: 'exact', userCompany: direct[0], candidates: direct }
    if (direct.length > 1) return { row, status: 'ambiguous', userCompany: null, candidates: direct }
    const candidates = [...new Map((index.get(key) ?? index.get(normalizeRankingName(row.companyName)) ?? []).map((company) => [company.id, company])).values()]
    if (candidates.length === 1) return { row, status: 'alias', userCompany: candidates[0], candidates }
    return { row, status: candidates.length ? 'ambiguous' : 'unresolved', userCompany: null, candidates }
  })
}

export function addRankingOnlyCompanies(data: AppDataV2, matches: readonly RankingNameMatch[], now: string): AppDataV2 {
  const additions = matches.filter((match) => match.status === 'unresolved').map((match) => ({
    id: createId('user-company'),
    masterCompanyId: null,
    userEnteredName: match.row.companyName,
    role: '',
    applicationCategory: 'ランキング取込',
    manualPriority: 'C' as const,
    interest: 0,
    applicationStatus: '検討中' as const,
    myPageStatus: '未開設' as const,
    applicationUrl: match.row.sourceUrl ?? '',
    selectionPhase: 'considering' as const,
    selectionState: 'active' as const,
    closeReason: null,
    offerDecision: null,
    selectionStageUpdatedAt: now,
    lastCompanyInteractionAt: null,
    memo: '2026-08-26 個人ランキング取込。監視は未設定。',
    watchEnabled: false,
    events: [],
    createdAt: now,
    updatedAt: now,
  }))
  return additions.length ? { ...data, userCompanies: [...data.userCompanies, ...additions] } : data
}

export function fingerprintPersonalRanking(rows: readonly PersonalRankingRow[]): string {
  const payload = rows.map((row) => [row.rank, row.companyName, row.rawScore, row.totalScore].join('|')).join('\n')
  let hash = 2166136261
  for (let index = 0; index < payload.length; index += 1) hash = Math.imul(hash ^ payload.charCodeAt(index), 16777619)
  return `fnv1a-${(hash >>> 0).toString(16)}`
}

export function applyPersonalRankingImport(
  data: AppDataV2,
  matches: readonly RankingNameMatch[],
  now: string,
): AppDataV2 {
  const actionable = matches.filter((match): match is RankingNameMatch & { userCompany: UserCompany; status: 'exact' | 'alias' | 'ranking_only' } => match.userCompany !== null && (match.status === 'exact' || match.status === 'alias' || match.status === 'ranking_only'))
  if (actionable.length !== matches.length) throw new Error('未解決または曖昧な企業があるため、評価は反映しません。')
  const profile = createPersonalRankingProfile(now)
  const sourceFingerprint = fingerprintPersonalRanking(matches.map((match) => match.row))
  const existingByCompany = new Map(data.evaluations.filter((evaluation) => evaluation.scoringProfileId === profile.id).map((evaluation) => [evaluation.userCompanyId, evaluation]))
  const imported = new Map(actionable.map((match) => [match.userCompany.id, match.row]))
  const preserved = data.evaluations.filter((evaluation) => evaluation.scoringProfileId !== profile.id || !imported.has(evaluation.userCompanyId))
  const evaluations: CompanyEvaluation[] = actionable.map((match) => {
    const previous = existingByCompany.get(match.userCompany.id)
    return {
      id: previous?.id ?? createId('evaluation'),
      userCompanyId: match.userCompany.id,
      scoringProfileId: profile.id,
      values: rankingValues(match.row),
      sourceName: PERSONAL_RANKING_SOURCE,
      sourceAsOf: PERSONAL_RANKING_AS_OF,
      sourceFingerprint,
      sourceRank: match.row.rank,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    }
  })
  const profiles = data.scoringProfiles.some((item) => item.id === profile.id)
    ? data.scoringProfiles.map((item) => item.id === profile.id ? profile : item)
    : [...data.scoringProfiles, profile]
  return {
    ...data,
    revision: data.revision + 1,
    updatedAt: now,
    scoringProfiles: profiles,
    activeScoringProfileId: profile.id,
    canonicalScoringProfileId: profile.id,
    evaluations: [...preserved, ...evaluations],
  }
}

export function verifyPersonalRanking(matches: readonly RankingNameMatch[], data: AppDataV2) {
  const profile = data.scoringProfiles.find((item) => item.id === PERSONAL_RANKING_PROFILE_ID)
  if (!profile) throw new Error('個人ランキング用Scoring Profileがありません。')
  const byCompany = new Map(data.evaluations.filter((item) => item.scoringProfileId === profile.id).map((item) => [item.userCompanyId, item]))
  const rows = matches.map((match) => {
    if (!match.userCompany) throw new Error('未解決企業は検証できません。')
    const evaluation = byCompany.get(match.userCompany.id) ?? null
    const result = calculateScore(profile, evaluation)
    const appRaw = evaluation === null ? null : profile.criteria.reduce((sum, criterion) => sum + ((evaluation.values[criterion.id] ?? 0) / criterion.scaleMax * criterion.weight), 0)
    return { companyName: match.row.companyName, excelRank: match.row.rank, excelRaw: match.row.rawScore, excelTotal: match.row.totalScore, appRaw, appTotal: result.score }
  })
  const sorted = [...rows].sort((a, b) => (b.appTotal ?? -Infinity) - (a.appTotal ?? -Infinity) || a.excelRank - b.excelRank)
  return rows.map((row) => ({ ...row, appRank: sorted.findIndex((candidate) => candidate.companyName === row.companyName) + 1, scoreDifference: row.appTotal === null ? Infinity : Math.abs(row.appTotal - row.excelTotal) }))
}
