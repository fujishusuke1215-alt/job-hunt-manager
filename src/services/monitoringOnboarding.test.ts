import { describe, expect, it } from 'vitest'
import { syncMonitoringTargetsFromCandidates } from './monitoringOnboarding'
const candidate = { id: 'c1', userEnteredName: 'Example', applicationUrl: 'https://example.test', } as never
describe('syncMonitoringTargetsFromCandidates', () => {
  it('is idempotent and makes unknown eligibility watch', () => { const once = syncMonitoringTargetsFromCandidates([candidate], []); const twice = syncMonitoringTargetsFromCandidates([candidate], once.targets); expect(once.targets).toEqual(twice.targets); expect(once.targets[0]).toMatchObject({ status: 'watch', enabled: false }); expect(once.findings).toHaveLength(1) })
  it('archives targets removed from candidates and excludes ineligible', () => { const old = syncMonitoringTargetsFromCandidates([candidate], []).targets[0]; old.workHistoryEligibility = 'ineligible'; const result = syncMonitoringTargetsFromCandidates([], [old]); expect(result.targets[0]).toMatchObject({ status: 'archived', enabled: false }) })
})
