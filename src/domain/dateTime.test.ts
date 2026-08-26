import { describe, expect, it } from 'vitest'
import { canonicalIsoDateTime } from './dateTime'

describe('canonicalIsoDateTime', () => {
  it('preserves canonical ISO datetimes', () => {
    expect(canonicalIsoDateTime('2026-08-26T12:51:47.000Z')).toBe('2026-08-26T12:51:47.000Z')
  })

  it('normalizes PostgreSQL timestamptz text without changing the instant', () => {
    expect(canonicalIsoDateTime('2026-08-26 12:34:13+00')).toBe('2026-08-26T12:34:13.000Z')
  })

  it('does not guess a timezone for malformed or timezone-less timestamps', () => {
    expect(canonicalIsoDateTime('2026-08-26 12:34:13')).toBeNull()
    expect(canonicalIsoDateTime('not a date')).toBeNull()
  })
})
