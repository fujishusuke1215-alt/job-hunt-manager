import type { CompanyView, SelectionEvent } from './types'

export type ScheduleConflictKind = 'confirmed' | 'possible'
export interface ScheduleConflict {
  kind: ScheduleConflictKind
  left: { company: CompanyView; event: SelectionEvent }
  right: { company: CompanyView; event: SelectionEvent }
}

const timeBoundTypes = new Set(['面接', '説明会', 'Webテスト', 'コーディングテスト', 'その他'])
const isActive = (event: SelectionEvent) => timeBoundTypes.has(event.type) && !['完了', '見送り'].includes(event.status) && Boolean(event.startsAt ?? event.scheduledAt)
const startOf = (event: SelectionEvent) => new Date(event.startsAt ?? event.scheduledAt).getTime()
const endOf = (event: SelectionEvent) => event.endsAt ? new Date(event.endsAt).getTime() : null

export function detectScheduleConflicts(companies: readonly CompanyView[]): ScheduleConflict[] {
  const items = companies.flatMap(company => company.company.events.filter(isActive).map(event => ({ company, event })))
  const conflicts: ScheduleConflict[] = []
  for (let i = 0; i < items.length; i += 1) for (let j = i + 1; j < items.length; j += 1) {
    const left = items[i], right = items[j]
    if (left.company.company.id === right.company.company.id) continue
    const leftStart = startOf(left.event), rightStart = startOf(right.event), leftEnd = endOf(left.event), rightEnd = endOf(right.event)
    if (!Number.isFinite(leftStart) || !Number.isFinite(rightStart)) continue
    const overlap = leftEnd !== null && rightEnd !== null ? leftStart < rightEnd && rightStart < leftEnd : Math.abs(leftStart - rightStart) <= 30 * 60 * 1000
    if (!overlap) continue
    conflicts.push({ kind: leftEnd !== null && rightEnd !== null ? 'confirmed' : 'possible', left, right })
  }
  return conflicts
}
