import type { SelectionEvent } from '../domain/types'

interface CompanyWithEvents {
  events: SelectionEvent[]
}

const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate())

export function getDaysUntil(dateText: string, now = new Date()): number | null {
  if (!dateText) return null
  const date = new Date(dateText)
  if (Number.isNaN(date.getTime())) return null
  const diff = startOfDay(date).getTime() - startOfDay(now).getTime()
  return Math.ceil(diff / 86_400_000)
}

export function getNextEvent(company: CompanyWithEvents, now = new Date()): SelectionEvent | undefined {
  return [...company.events]
    .filter((event) => event.status !== '完了' && event.status !== '見送り')
    .filter((event) => {
      const days = getDaysUntil(event.scheduledAt, now)
      return days !== null && days >= 0
    })
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0]
}

export function getMostUrgentEvent(company: CompanyWithEvents, now = new Date()): SelectionEvent | undefined {
  return [...company.events]
    .filter((event) => event.status !== '完了' && event.status !== '見送り')
    .filter((event) => getDaysUntil(event.scheduledAt, now) !== null)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0]
}

export function formatDeadlineLabel(dateText: string, now = new Date()): string {
  const days = getDaysUntil(dateText, now)
  if (days === null) return '期限なし'
  if (days < 0) return `${Math.abs(days)}日超過`
  if (days === 0) return '今日'
  if (days === 1) return '明日'
  return `あと${days}日`
}

export function deadlineTone(dateText: string, now = new Date()): 'overdue' | 'soon' | 'normal' {
  const days = getDaysUntil(dateText, now)
  if (days !== null && days < 0) return 'overdue'
  if (days !== null && days <= 7) return 'soon'
  return 'normal'
}
