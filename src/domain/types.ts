export const applicationStatuses = [
  '検討中',
  'マイページ作成済み',
  'ES提出済み',
  'Webテスト受験済み',
  'コーディングテスト',
  'グループディスカッション',
  '1次面接',
  '2次面接',
  '3次面接',
  '最終面接',
  '不合格',
  '選考管理を終了',
  '応募準備',
  'ES提出待ち',
  'Webテスト待ち',
  'コーディングテスト待ち',
  '面接待ち',
  '結果待ち',
  '内定',
  '終了',
] as const

export type ApplicationStatus = (typeof applicationStatuses)[number]

export const selectionPhases = [
  'considering', 'mypage_created', 'es_submitted', 'web_test_completed',
  'coding_test', 'group_discussion', 'interview_1', 'interview_2',
  'interview_3', 'final_interview', 'awaiting_result', 'offer',
] as const
export type SelectionPhase = (typeof selectionPhases)[number]
export const selectionStates = ['active', 'closed'] as const
export type SelectionState = (typeof selectionStates)[number]
export const closeReasons = ['rejected', 'user_closed', 'recruitment_closed', 'other'] as const
export type CloseReason = (typeof closeReasons)[number]
export const offerDecisions = ['considering', 'accepted', 'declined'] as const
export type OfferDecision = (typeof offerDecisions)[number]

export const priorities = ['A', 'B', 'C'] as const
export type Priority = (typeof priorities)[number]

export const eligibilityOptions = ['応募可', '応募不可', '要確認'] as const
export type Eligibility = (typeof eligibilityOptions)[number]

export const myPageStatuses = ['未開設', '開設済み', '不要'] as const
export type MyPageStatus = (typeof myPageStatuses)[number]

export const eventTypes = [
  'エントリー',
  '説明会',
  'ES',
  'Webテスト',
  'コーディングテスト',
  '面接',
  'その他',
] as const
export type SelectionEventType = (typeof eventTypes)[number]

export const eventStatuses = ['予定', '完了', '結果待ち', '見送り'] as const
export type SelectionEventStatus = (typeof eventStatuses)[number]

export const masterCompanyStatuses = ['active', 'merged', 'inactive'] as const
export type MasterCompanyStatus = (typeof masterCompanyStatuses)[number]

export const sourceTypes = [
  'official_web',
  'email',
  'third_party_web',
  'user',
  'ai_summary',
  'legacy',
] as const
export type SourceType = (typeof sourceTypes)[number]

export const verificationLevels = [
  'official_confirmed',
  'official_interpreted',
  'third_party_correlated',
  'unverified',
] as const
export type VerificationLevel = (typeof verificationLevels)[number]

export const reviewStatuses = ['draft', 'confirmed', 'stale', 'rejected'] as const
export type ReviewStatus = (typeof reviewStatuses)[number]

export const watchFindingStatuses = ['new', 'seen', 'completed', 'dismissed'] as const
export type WatchFindingStatus = (typeof watchFindingStatuses)[number]

export const watchSeverities = ['high', 'medium', 'low'] as const
export type WatchSeverity = (typeof watchSeverities)[number]

export const watchFindingTypes = [
  'recruitment_started',
  'mypage_opened',
  'application_deadline',
  'web_test',
  'coding_test',
  'interview',
  'result',
  'eligibility_changed',
  'recruitment_info_changed',
  'email_action',
  'other',
] as const
export type WatchFindingType = (typeof watchFindingTypes)[number]

export type AppMode = 'demo' | 'personal'
export type ViewName = 'dashboard' | 'companies' | 'scoring' | 'ai-sync' | 'watch' | 'findings' | 'data'
export type SyncStatus = 'signed-out' | 'loading' | 'synced' | 'saving' | 'offline' | 'conflict'
export type StorageMode = 'local' | 'google' | 'supabase' | 'disabled'

export interface SelectionEvent {
  id: string
  type: SelectionEventType
  title: string
  scheduledAt: string
  status: SelectionEventStatus
  location: string
  memo: string
  autoActionType?: string | null
  dueAt?: string | null
  startsAt?: string | null
  endsAt?: string | null
  sourceMessageId?: string | null
  sourceThreadId?: string | null
  sourceSubject?: string | null
  sourceUrl?: string | null
  evidenceExcerpt?: string | null
  myPageUrl?: string | null
  autoProcessed?: boolean
  confidence?: number | null
}

export interface MasterCompany {
  id: string
  slug: string
  legalName: string
  displayName: string
  aliases: string[]
  formerNames: string[]
  officialDomains: string[]
  status: MasterCompanyStatus
  mergedIntoId: string | null
  createdAt: string
  updatedAt: string
}

export interface CatalogData {
  schemaVersion: 1
  masterCompanies: MasterCompany[]
  updatedAt: string
}

export interface UserCompany {
  id: string
  masterCompanyId: string | null
  userEnteredName: string
  role: string
  applicationCategory: string
  manualPriority: Priority
  interest: number
  applicationStatus: ApplicationStatus
  myPageStatus: MyPageStatus
  applicationUrl: string
  selectionPhase?: SelectionPhase
  selectionState?: SelectionState
  closeReason?: CloseReason | null
  offerDecision?: OfferDecision | null
  selectionStageUpdatedAt?: string
  lastCompanyInteractionAt?: string | null
  memo: string
  watchEnabled: boolean
  events: SelectionEvent[]
  createdAt: string
  updatedAt: string
}

export interface ResearchSource {
  id: string
  type: SourceType
  title: string
  url: string | null
  retrievedAt: string | null
  publishedAt: string | null
  note: string
}

export interface ResearchFact {
  id: string
  userCompanyId: string | null
  masterCompanyId: string | null
  key: string
  label: string
  value: string
  recruitingCycle: string | null
  roleScope: string | null
  checkedAt: string | null
  verificationLevel: VerificationLevel
  reviewStatus: ReviewStatus
  processedByAi: boolean
  sources: ResearchSource[]
  createdAt: string
  updatedAt: string
}

export interface Criterion {
  id: string
  label: string
  description: string
  scaleMax: number
  weight: number
  enabled: boolean
  order: number
}

export interface ScoringProfile {
  id: string
  name: string
  criteria: Criterion[]
  kind: 'built_in' | 'custom' | 'legacy'
  createdAt: string
  updatedAt: string
}

export interface CompanyEvaluation {
  id: string
  userCompanyId: string
  scoringProfileId: string
  values: Record<string, number | null>
  /** Optional provenance for a reproducible personal ranking import. */
  sourceName?: string
  sourceAsOf?: string
  sourceFingerprint?: string
  /** Explicit source ordering used only when equal scores need a stable, documented tie-break. */
  sourceRank?: number
  createdAt: string
  updatedAt: string
}

export interface WatchRun {
  id: string
  provider: string
  startedAt: string
  completedAt: string
  findingCount: number
  status: 'completed' | 'failed'
  note: string
}

export interface WatchFinding {
  id: string
  userCompanyId: string
  masterCompanyId: string | null
  watchRunId: string | null
  type: WatchFindingType
  severity: WatchSeverity
  title: string
  summary: string
  detectedAt: string
  deadline: string | null
  source: ResearchSource | null
  status: WatchFindingStatus
  fingerprint: string
  createdAt: string
  updatedAt: string
}

export interface UserSettings {
  includePersonalNotesInAiExport: boolean
  locale: 'ja-JP'
  graduationYear: number | null
  lastUserActiveAt: string | null
}

export interface MigrationHistoryEntry {
  id: string
  fromVersion: number
  toVersion: number
  migratedAt: string
  sourceKey: string
  backupKey: string
  summary: string
}

export interface AiImportHistoryEntry {
  id: string
  provider: string
  envelopeGeneratedAt: string
  importedAt: string
  appliedOperationIds: string[]
  skippedOperationIds: string[]
}

export interface AppDataV2 {
  schemaVersion: 2
  revision: number
  userCompanies: UserCompany[]
  researchFacts: ResearchFact[]
  scoringProfiles: ScoringProfile[]
  activeScoringProfileId: string
  evaluations: CompanyEvaluation[]
  watchRuns: WatchRun[]
  watchFindings: WatchFinding[]
  userSettings: UserSettings
  migrationHistory: MigrationHistoryEntry[]
  aiImportHistory: AiImportHistoryEntry[]
  processedOperationIds: string[]
  updatedAt: string
}

export interface ScoreResult {
  score: number | null
  coverage: number
  evaluatedWeight: number
  enabledWeight: number
  provisional: boolean
}

export interface CompanyView {
  company: UserCompany
  displayName: string
  master: MasterCompany | null
  facts: ResearchFact[]
  evaluation: CompanyEvaluation | null
  score: ScoreResult
}

export interface CompanyFilters {
  query: string
  status: ApplicationStatus | 'すべて'
  priority: Priority | 'すべて'
  eligibility: Eligibility | 'すべて'
  deadline: 'すべて' | '7日以内' | '期限超過' | '期限なし'
  sort: '締切が近い順' | '総合点が高い順' | '更新が新しい順' | '企業名順'
}

export interface UserCompanyDraft {
  masterCompanyId: string | null
  userEnteredName: string
  role: string
  applicationCategory: string
  manualPriority: Priority
  interest: number
  applicationStatus: ApplicationStatus
  myPageStatus: MyPageStatus
  applicationUrl: string
  selectionPhase: SelectionPhase
  selectionState: SelectionState
  closeReason: CloseReason | null
  offerDecision: OfferDecision | null
  memo: string
  watchEnabled: boolean
}
