import { describe, expect, it } from 'vitest'
import { deadlineTone, formatDeadlineLabel, getDaysUntil } from './deadlines'

const now = new Date('2026-08-20T10:00:00+09:00')

describe('deadline utilities', () => {
  it('同じ日を今日と判定する', () => {
    expect(getDaysUntil('2026-08-20T23:00:00+09:00', now)).toBe(0)
    expect(formatDeadlineLabel('2026-08-20T23:00:00+09:00', now)).toBe('今日')
  })

  it('7日以内と期限超過を区別する', () => {
    expect(deadlineTone('2026-08-26T18:00:00+09:00', now)).toBe('soon')
    expect(deadlineTone('2026-08-19T18:00:00+09:00', now)).toBe('overdue')
  })
})

