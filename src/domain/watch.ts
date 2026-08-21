import type {
  SelectionEvent,
  SelectionEventStatus,
  UserCompany,
  WatchFinding,
  WatchFindingStatus,
  WatchSeverity,
} from './types'

export type WatchUpsertAction = 'created' | 'updated' | 'unchanged'

export interface WatchUpsertResult {
  findings: WatchFinding[]
  finding: WatchFinding
  action: WatchUpsertAction
}

export type TodayActionDeadlineBucket =
  | 'overdue'
  | 'within_24_hours'
  | 'within_3_days'
  | 'within_7_days'
  | 'later_or_none'

export type TodayActionSource = 'selection_event' | 'watch_finding'

export interface TodayAction {
  id: string
  source: TodayActionSource
  userCompanyId: string
  companyName: string
  title: string
  deadline: string | null
  severity: WatchSeverity
  companyScore: number | null
}

export interface RankedTodayAction extends TodayAction {
  deadlineBucket: TodayActionDeadlineBucket
  reason: string
}

export interface BuildTodayActionsOptions {
  companyNames?: Readonly<Record<string, string>>
  companyScores?: Readonly<Record<string, number | null | undefined>>
  includeLaterOrLowPriority?: boolean
  now?: Date | string
}

const deadlineBucketOrder: Record<TodayActionDeadlineBucket, number> = {
  overdue: 0,
  within_24_hours: 1,
  within_3_days: 2,
  within_7_days: 3,
  later_or_none: 4,
}

const severityOrder: Record<WatchSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
}

const actionableEventStatuses = new Set<SelectionEventStatus>(['予定', '結果待ち'])

function timestamp(value: Date | string): number {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error('基準日時が不正です。')
  return parsed
}

function comparableFinding(finding: WatchFinding) {
  const comparable: Partial<WatchFinding> = { ...finding }
  delete comparable.id
  delete comparable.createdAt
  delete comparable.updatedAt
  return comparable
}

function sameFindingContent(left: WatchFinding, right: WatchFinding): boolean {
  return JSON.stringify(comparableFinding(left)) === JSON.stringify(comparableFinding(right))
}

function findDuplicateIndex(findings: WatchFinding[], incoming: WatchFinding): number {
  const byId = findings.findIndex((finding) => finding.id === incoming.id)
  if (byId >= 0) return byId
  return findings.findIndex(
    (finding) =>
      finding.userCompanyId === incoming.userCompanyId &&
      finding.fingerprint === incoming.fingerprint,
  )
}

/**
 * fingerprint（または明示ID）が同じFindingを1件に保ちます。
 * 完了済みFindingは同じ内容の再取込でnewへ戻しません。
 */
export function upsertWatchFinding(
  findings: WatchFinding[],
  incoming: WatchFinding,
  now = new Date().toISOString(),
): WatchUpsertResult {
  const duplicateIndex = findDuplicateIndex(findings, incoming)
  if (duplicateIndex < 0) {
    const created = { ...incoming, createdAt: incoming.createdAt || now, updatedAt: now }
    return { findings: [...findings, created], finding: created, action: 'created' }
  }

  const current = findings[duplicateIndex]
  const nextStatus = current.status === 'completed' ? 'completed' : incoming.status
  const updated: WatchFinding = {
    ...incoming,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: now,
    status: nextStatus,
  }

  if (sameFindingContent(current, updated)) {
    return { findings, finding: current, action: 'unchanged' }
  }

  const nextFindings = findings.map((finding, index) =>
    index === duplicateIndex ? updated : finding,
  )
  return { findings: nextFindings, finding: updated, action: 'updated' }
}

/** 同じfingerprintの既存データを整理します。配列の後側ほど新しい候補として扱います。 */
export function deduplicateWatchFindings(
  findings: WatchFinding[],
  now = new Date().toISOString(),
): WatchFinding[] {
  return findings.reduce<WatchFinding[]>((deduplicated, finding) => {
    return upsertWatchFinding(deduplicated, finding, now).findings
  }, [])
}

export function updateWatchFindingStatus(
  findings: WatchFinding[],
  findingId: string,
  status: WatchFindingStatus,
  now = new Date().toISOString(),
): WatchFinding[] {
  let found = false
  const updated = findings.map((finding) => {
    if (finding.id !== findingId) return finding
    found = true
    if (finding.status === status) return finding
    return { ...finding, status, updatedAt: now }
  })
  if (!found) throw new Error(`Watch Findingが見つかりません: ${findingId}`)
  return updated
}

export function classifyActionDeadline(
  deadline: string | null,
  now: Date | string = new Date(),
): TodayActionDeadlineBucket {
  if (!deadline) return 'later_or_none'
  const deadlineAt = Date.parse(deadline)
  if (!Number.isFinite(deadlineAt)) return 'later_or_none'

  const remaining = deadlineAt - timestamp(now)
  if (remaining < 0) return 'overdue'
  if (remaining <= 24 * 60 * 60 * 1000) return 'within_24_hours'
  if (remaining <= 3 * 24 * 60 * 60 * 1000) return 'within_3_days'
  if (remaining <= 7 * 24 * 60 * 60 * 1000) return 'within_7_days'
  return 'later_or_none'
}

function actionReason(bucket: TodayActionDeadlineBucket, severity: WatchSeverity): string {
  if (bucket === 'overdue') return '期限超過'
  if (bucket === 'within_24_hours') return '24時間以内'
  if (bucket === 'within_3_days') return '3日以内'
  if (bucket === 'within_7_days') return '7日以内'
  if (severity === 'high') return '重要度 high'
  return '期限外または期限なし'
}

/**
 * AI判断を使わず、期限帯 → severity → 企業スコア → 企業名 → IDで安定ソートします。
 */
export function sortTodayActions(
  actions: TodayAction[],
  now: Date | string = new Date(),
): RankedTodayAction[] {
  return actions
    .map((action) => {
      const deadlineBucket = classifyActionDeadline(action.deadline, now)
      return { ...action, deadlineBucket, reason: actionReason(deadlineBucket, action.severity) }
    })
    .sort((left, right) => {
      const byDeadline = deadlineBucketOrder[left.deadlineBucket] - deadlineBucketOrder[right.deadlineBucket]
      if (byDeadline !== 0) return byDeadline

      const bySeverity = severityOrder[left.severity] - severityOrder[right.severity]
      if (bySeverity !== 0) return bySeverity

      const leftScore = left.companyScore ?? Number.NEGATIVE_INFINITY
      const rightScore = right.companyScore ?? Number.NEGATIVE_INFINITY
      if (leftScore !== rightScore) return rightScore - leftScore

      const byCompany = left.companyName.localeCompare(right.companyName, 'ja')
      if (byCompany !== 0) return byCompany
      return left.id.localeCompare(right.id)
    })
}

function selectionEventToAction(
  company: UserCompany,
  event: SelectionEvent,
  companyName: string,
  companyScore: number | null,
): TodayAction {
  return {
    id: `selection:${company.id}:${event.id}`,
    source: 'selection_event',
    userCompanyId: company.id,
    companyName,
    title: event.title || event.type,
    deadline: event.scheduledAt || null,
    severity: 'medium',
    companyScore,
  }
}

function watchFindingToAction(
  finding: WatchFinding,
  companyName: string,
  companyScore: number | null,
): TodayAction {
  return {
    id: `watch:${finding.id}`,
    source: 'watch_finding',
    userCompanyId: finding.userCompanyId,
    companyName,
    title: finding.title,
    deadline: finding.deadline,
    severity: finding.severity,
    companyScore,
  }
}

/** Dashboard用に未完了の選考予定とWatch Findingを同じ透明ルールへ載せます。 */
export function buildTodayActions(
  companies: UserCompany[],
  findings: WatchFinding[],
  options: BuildTodayActionsOptions = {},
): RankedTodayAction[] {
  const companyById = new Map(companies.map((company) => [company.id, company]))
  const nameOf = (company: UserCompany | undefined, userCompanyId: string) =>
    options.companyNames?.[userCompanyId] ?? company?.userEnteredName ?? '不明な企業'
  const scoreOf = (userCompanyId: string) => options.companyScores?.[userCompanyId] ?? null

  const eventActions = companies.flatMap((company) =>
    company.events
      .filter((event) => actionableEventStatuses.has(event.status))
      .map((event) =>
        selectionEventToAction(company, event, nameOf(company, company.id), scoreOf(company.id)),
      ),
  )
  const findingActions = findings
    .filter((finding) =>
      (finding.status === 'new' || finding.status === 'seen') &&
      companyById.get(finding.userCompanyId)?.watchEnabled !== false,
    )
    .map((finding) =>
      watchFindingToAction(
        finding,
        nameOf(companyById.get(finding.userCompanyId), finding.userCompanyId),
        scoreOf(finding.userCompanyId),
      ),
    )

  const ranked = sortTodayActions([...eventActions, ...findingActions], options.now)
  if (options.includeLaterOrLowPriority) return ranked
  return ranked.filter(
    (action) => action.deadlineBucket !== 'later_or_none' || action.severity === 'high',
  )
}
