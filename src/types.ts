export const applicationStatuses = [
  '検討中',
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

export const priorities = ['A', 'B', 'C'] as const
export type Priority = (typeof priorities)[number]

export const eligibilityOptions = ['応募可', '応募不可', '要確認'] as const
export type Eligibility = (typeof eligibilityOptions)[number]

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

export type AppMode = 'demo' | 'personal'
export type ViewName = 'dashboard' | 'companies' | 'data'

export interface EvaluationScores {
  salary: number
  benefits: number
  wlb: number
  remote: number
  flex: number
  overseas: number
  itFit: number
}

export interface SelectionEvent {
  id: string
  type: SelectionEventType
  title: string
  scheduledAt: string
  status: SelectionEventStatus
  location: string
  memo: string
}

export interface Company {
  id: string
  name: string
  role: string
  applicationCategory: string
  priority: Priority
  interest: number
  status: ApplicationStatus
  graduateEligibility: Eligibility
  existingGraduateEligibility: Eligibility
  workExperienceEligibility: Eligibility
  webTest: string
  codingTest: string
  myPageStatus: '未開設' | '開設済み' | '不要'
  applicationUrl: string
  memo: string
  scores: EvaluationScores
  events: SelectionEvent[]
  createdAt: string
  updatedAt: string
}

export type CompanyDraft = Omit<Company, 'id' | 'createdAt' | 'updatedAt' | 'events'>

export interface CompanyFilters {
  query: string
  status: ApplicationStatus | 'すべて'
  priority: Priority | 'すべて'
  eligibility: Eligibility | 'すべて'
  deadline: 'すべて' | '7日以内' | '期限超過' | '期限なし'
  sort: '締切が近い順' | '総合点が高い順' | '更新が新しい順' | '企業名順'
}

export interface BackupData {
  schemaVersion: 1
  exportedAt: string
  companies: Company[]
}
