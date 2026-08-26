import type { WatchFinding, WatchFindingType } from '../domain/types'
import { canonicalIsoDateTime } from '../domain/dateTime'
import { createId } from '../utils/id'

export type CollectorFindingStatus = 'new' | 'needs_review' | 'approved' | 'rejected' | 'superseded'
export type CollectorTriageAction = 'auto_matched' | 'auto_approved' | 'auto_archived' | 'manual_review'
export interface CollectorFinding { id: string; company: string | null; findingType: string; payload: Record<string, unknown>; sourceType: 'gmail' | 'web' | 'manual'; sourceExternalId: string | null; sourceUrl: string | null; sourceTimestamp: string | null; observedAt: string; confidence: number; evidenceExcerpt: string; fingerprint: string; status: CollectorFindingStatus; reviewReason: string | null; triageAction?: CollectorTriageAction | null; triageReason?: string | null; triageConfidence?: number | null }

const typeMap: Record<string, WatchFindingType> = { deadline: 'application_deadline', selection_event: 'other', test: 'web_test', interview: 'interview', application_open: 'recruitment_started', result_notice: 'result', eligibility_review_required: 'eligibility_changed' }
function isoDateTime(value: string | null | undefined, fallback: string): string {
  return canonicalIsoDateTime(value) ?? canonicalIsoDateTime(fallback) ?? new Date(0).toISOString()
}
export function approveCollectorFinding(finding: CollectorFinding, userCompanyId: string, now = new Date().toISOString()): WatchFinding {
  const observedAt = isoDateTime(finding.observedAt, now)
  return { id: createId('watch-finding'), userCompanyId, masterCompanyId: null, watchRunId: null, type: typeMap[finding.findingType] ?? 'other', severity: finding.findingType === 'deadline' || finding.findingType === 'manual_mypage_check_required' ? 'high' : 'medium', title: String(finding.payload.subject ?? finding.findingType), summary: finding.evidenceExcerpt, detectedAt: observedAt, deadline: canonicalIsoDateTime(finding.payload.deadline), source: { id: createId('source'), type: finding.sourceType === 'gmail' ? 'email' : finding.sourceType === 'web' ? 'official_web' : 'user', title: finding.sourceExternalId ?? finding.sourceType, url: finding.sourceUrl, retrievedAt: observedAt, publishedAt: canonicalIsoDateTime(finding.sourceTimestamp), note: finding.evidenceExcerpt }, status: 'new', fingerprint: finding.fingerprint, createdAt: isoDateTime(now, new Date().toISOString()), updatedAt: isoDateTime(now, new Date().toISOString()) }
}
