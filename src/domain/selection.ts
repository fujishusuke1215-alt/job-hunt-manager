import type { ApplicationStatus, CloseReason, OfferDecision, SelectionPhase, SelectionState, UserCompany } from './types'

export const selectionStatusOptions = [
  '検討中', 'マイページ作成済み', 'ES提出済み', 'Webテスト受験済み',
  'コーディングテスト', 'グループディスカッション', '1次面接', '2次面接',
  '3次面接', '最終面接', '結果待ち', '内定', '不合格', '選考管理を終了',
] as const
export type SelectionStatusLabel = (typeof selectionStatusOptions)[number]

const fromLegacy: Record<string, SelectionStatusLabel> = {
  '応募準備': '検討中', 'ES提出待ち': '検討中', 'Webテスト待ち': '検討中',
  'コーディングテスト待ち': 'コーディングテスト', '面接待ち': '1次面接', '終了': '選考管理を終了',
}

export function selectionFromLabel(label: SelectionStatusLabel): {
  selectionPhase: SelectionPhase; selectionState: SelectionState; closeReason: CloseReason | null; offerDecision: OfferDecision | null; applicationStatus: ApplicationStatus
} {
  const map: Record<SelectionStatusLabel, Omit<ReturnType<typeof selectionFromLabel>, 'applicationStatus'>> = {
    '検討中': { selectionPhase: 'considering', selectionState: 'active', closeReason: null, offerDecision: null },
    'マイページ作成済み': { selectionPhase: 'mypage_created', selectionState: 'active', closeReason: null, offerDecision: null },
    'ES提出済み': { selectionPhase: 'es_submitted', selectionState: 'active', closeReason: null, offerDecision: null },
    'Webテスト受験済み': { selectionPhase: 'web_test_completed', selectionState: 'active', closeReason: null, offerDecision: null },
    'コーディングテスト': { selectionPhase: 'coding_test', selectionState: 'active', closeReason: null, offerDecision: null },
    'グループディスカッション': { selectionPhase: 'group_discussion', selectionState: 'active', closeReason: null, offerDecision: null },
    '1次面接': { selectionPhase: 'interview_1', selectionState: 'active', closeReason: null, offerDecision: null },
    '2次面接': { selectionPhase: 'interview_2', selectionState: 'active', closeReason: null, offerDecision: null },
    '3次面接': { selectionPhase: 'interview_3', selectionState: 'active', closeReason: null, offerDecision: null },
    '最終面接': { selectionPhase: 'final_interview', selectionState: 'active', closeReason: null, offerDecision: null },
    '結果待ち': { selectionPhase: 'awaiting_result', selectionState: 'active', closeReason: null, offerDecision: null },
    '内定': { selectionPhase: 'offer', selectionState: 'active', closeReason: null, offerDecision: 'considering' },
    '不合格': { selectionPhase: 'awaiting_result', selectionState: 'closed', closeReason: 'rejected', offerDecision: null },
    '選考管理を終了': { selectionPhase: 'considering', selectionState: 'closed', closeReason: 'user_closed', offerDecision: null },
  }
  return { ...map[label], applicationStatus: label as ApplicationStatus }
}

export function selectionLabel(company: Pick<UserCompany, 'applicationStatus' | 'selectionPhase' | 'selectionState' | 'closeReason'>): SelectionStatusLabel {
  if (company.selectionState === 'closed') return company.closeReason === 'rejected' ? '不合格' : '選考管理を終了'
  const phase: Record<SelectionPhase, SelectionStatusLabel> = {
    considering: '検討中', mypage_created: 'マイページ作成済み', es_submitted: 'ES提出済み',
    web_test_completed: 'Webテスト受験済み', coding_test: 'コーディングテスト', group_discussion: 'グループディスカッション',
    interview_1: '1次面接', interview_2: '2次面接', interview_3: '3次面接', final_interview: '最終面接',
    awaiting_result: '結果待ち', offer: '内定',
  }
  return company.selectionPhase ? phase[company.selectionPhase] : (fromLegacy[company.applicationStatus] ?? (company.applicationStatus as SelectionStatusLabel) ?? '検討中')
}

export function selectionFromLegacy(status: ApplicationStatus) {
  return selectionFromLabel((fromLegacy[status] ?? status) as SelectionStatusLabel)
}
