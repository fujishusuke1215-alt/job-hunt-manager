import type { WatchFinding, WatchFindingType } from '../domain/types'
import { createId } from '../utils/id'

export type CollectorFindingStatus = 'new' | 'needs_review' | 'approved' | 'rejected' | 'superseded'
export interface CollectorFinding { id: string; company: string | null; findingType: string; payload: Record<string, unknown>; sourceType: 'gmail' | 'web' | 'manual'; sourceExternalId: string | null; sourceUrl: string | null; sourceTimestamp: string | null; observedAt: string; confidence: number; evidenceExcerpt: string; fingerprint: string; status: CollectorFindingStatus; reviewReason: string | null }

const typeMap: Record<string, WatchFindingType> = { deadline: 'application_deadline', selection_event: 'other', test: 'web_test', interview: 'interview', application_open: 'recruitment_started', result_notice: 'result', eligibility_review_required: 'eligibility_changed' }
export function approveCollectorFinding(finding: CollectorFinding, userCompanyId: string, now = new Date().toISOString()): WatchFinding {
  return { id: createId('watch-finding'), userCompanyId, masterCompanyId: null, watchRunId: null, type: typeMap[finding.findingType] ?? 'other', severity: finding.findingType === 'deadline' || finding.findingType === 'manual_mypage_check_required' ? 'high' : 'medium', title: String(finding.payload.subject ?? finding.findingType), summary: finding.evidenceExcerpt, detectedAt: finding.observedAt, deadline: typeof finding.payload.deadline === 'string' ? finding.payload.deadline : null, source: { id: createId('source'), type: finding.sourceType === 'gmail' ? 'email' : finding.sourceType === 'web' ? 'official_web' : 'user', title: finding.sourceExternalId ?? finding.sourceType, url: finding.sourceUrl, retrievedAt: finding.observedAt, publishedAt: finding.sourceTimestamp, note: finding.evidenceExcerpt }, status: 'new', fingerprint: finding.fingerprint, createdAt: now, updatedAt: now }
}
