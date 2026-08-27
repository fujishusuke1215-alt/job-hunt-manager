import { describe, expect, it } from 'vitest'
import { detectScheduleConflicts } from './scheduleConflicts'
import type { CompanyView } from './types'

const company = (id: string, startsAt: string, endsAt: string | null): CompanyView => ({ company: { id, masterCompanyId: null, userEnteredName: id, role: '', applicationCategory: '', manualPriority: 'A', interest: 3, applicationStatus: '面接待ち', myPageStatus: '未開設', applicationUrl: '', memo: '', watchEnabled: true, events: [{ id: `${id}-event`, type: '面接', title: '面接', scheduledAt: startsAt, startsAt, endsAt, status: '予定', location: '', memo: '' }], createdAt: startsAt, updatedAt: startsAt }, displayName: id, master: null, facts: [], evaluation: null, score: { score: null, coverage: 0, evaluatedWeight: 0, enabledWeight: 1, provisional: true } })
describe('detectScheduleConflicts', () => {
  it('finds exact and partial overlaps', () => expect(detectScheduleConflicts([company('A','2026-09-03T05:00:00.000Z','2026-09-03T06:00:00.000Z'), company('B','2026-09-03T05:30:00.000Z','2026-09-03T06:30:00.000Z')])[0]?.kind).toBe('confirmed'))
  it('labels unknown end times as possible only', () => expect(detectScheduleConflicts([company('A','2026-09-03T05:00:00.000Z',null), company('B','2026-09-03T05:00:00.000Z',null)])[0]?.kind).toBe('possible'))
  it('does not report separated appointments', () => expect(detectScheduleConflicts([company('A','2026-09-03T05:00:00.000Z','2026-09-03T06:00:00.000Z'), company('B','2026-09-03T07:00:00.000Z','2026-09-03T08:00:00.000Z')])).toEqual([]))
})
