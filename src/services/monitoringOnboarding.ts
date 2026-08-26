import type { UserCompany } from '../domain/types'

export type MonitoringStatus = 'pending_enrichment' | 'eligibility_review' | 'active' | 'watch' | 'excluded' | 'disabled' | 'archived'
export type WorkHistoryEligibility = 'confirmed' | 'eligible_no_exclusion_found' | 'needs_review' | 'ineligible'
export interface MonitoringTarget { candidateCompanyId: string; canonicalName: string; aliases: string[]; officialUrl: string | null; mypageUrl: string | null; senderDomains: string[]; status: MonitoringStatus; workHistoryEligibility: WorkHistoryEligibility; eligibilitySourceUrl: string | null; eligibilityCheckedAt: string | null; eligibilityEvidence: string | null; enabled: boolean }
export interface OnboardingFinding { candidateCompanyId: string; type: 'eligibility_review_required'; fingerprint: string }

export function monitoringStatusFor(eligibility: WorkHistoryEligibility): MonitoringStatus {
  if (eligibility === 'ineligible') return 'excluded'
  if (eligibility === 'needs_review') return 'watch'
  return 'active'
}

// Idempotent projection: UserCompany is the source; targets are never a second CSV to maintain.
export function syncMonitoringTargetsFromCandidates(candidates: readonly UserCompany[], current: readonly MonitoringTarget[]): { targets: MonitoringTarget[]; findings: OnboardingFinding[] } {
  const byCandidate = new Map(current.map((target) => [target.candidateCompanyId, target]))
  const targets = candidates.map((company) => {
    const prior = byCandidate.get(company.id)
    const aliases = unique([company.userEnteredName, ...(prior?.aliases ?? [])])
    const eligibility = prior?.workHistoryEligibility ?? 'needs_review'
    return { candidateCompanyId: company.id, canonicalName: company.userEnteredName, aliases, officialUrl: company.applicationUrl || prior?.officialUrl || null, mypageUrl: prior?.mypageUrl ?? null, senderDomains: prior?.senderDomains ?? [], status: monitoringStatusFor(eligibility), workHistoryEligibility: eligibility, eligibilitySourceUrl: prior?.eligibilitySourceUrl ?? null, eligibilityCheckedAt: prior?.eligibilityCheckedAt ?? null, eligibilityEvidence: prior?.eligibilityEvidence ?? null, enabled: eligibility === 'confirmed' || eligibility === 'eligible_no_exclusion_found' }
  })
  const activeIds = new Set(candidates.map((company) => company.id))
  current.filter((target) => !activeIds.has(target.candidateCompanyId)).forEach((target) => targets.push({ ...target, status: 'archived', enabled: false }))
  return { targets, findings: targets.filter((target) => target.workHistoryEligibility === 'needs_review' && target.status !== 'archived').map((target) => ({ candidateCompanyId: target.candidateCompanyId, type: 'eligibility_review_required', fingerprint: `eligibility-review:${target.candidateCompanyId}` })) }
}
function unique(values: string[]) { return [...new Set(values.map((value) => value.trim()).filter(Boolean))] }
