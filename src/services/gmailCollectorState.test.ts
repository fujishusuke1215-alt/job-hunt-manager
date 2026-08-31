import { describe, expect, it } from 'vitest'
import { nextGmailCollectorState } from './gmailCollectorState'

describe('Gmail collector state transitions', () => {
  const attemptedAt = '2026-09-01T00:50:00.000Z'
  const prior = {
    cursor: { account_verified: true, checkpoint: 'retained' },
    failure_count: 2,
  }

  it('records running without converting it into success or clearing failures', () => {
    expect(nextGmailCollectorState('running', prior, attemptedAt)).toEqual({
      last_attempt: attemptedAt,
      cursor: { account_verified: true, checkpoint: 'retained' },
    })
  })

  it('records success only after a completed run', () => {
    expect(nextGmailCollectorState('success', prior, attemptedAt)).toEqual({
      last_attempt: attemptedAt,
      last_success: attemptedAt,
      last_error_category: null,
      failure_count: 0,
      cursor: { account_verified: true, checkpoint: 'retained' },
    })
  })

  it('increments failures while preserving the last successful checkpoint', () => {
    expect(nextGmailCollectorState('failed', prior, attemptedAt, 'gmail_account_unconfigured')).toEqual({
      last_attempt: attemptedAt,
      last_error_category: 'gmail_account_unconfigured',
      failure_count: 3,
      cursor: { account_verified: false, checkpoint: 'retained' },
    })
  })
})
