export type GmailCollectorStatus = 'running' | 'success' | 'failed'

export type StoredGmailCollectorState = {
  cursor?: unknown
  failure_count?: number | null
}

export function nextGmailCollectorState(
  status: GmailCollectorStatus,
  prior: StoredGmailCollectorState | null | undefined,
  attemptedAt: string,
  errorCategory?: string,
) {
  const priorCursor = prior?.cursor && typeof prior.cursor === 'object'
    ? prior.cursor as Record<string, unknown>
    : {}
  const cursor = { ...priorCursor, account_verified: status !== 'failed' }

  if (status === 'running') return { last_attempt: attemptedAt, cursor }
  if (status === 'success') {
    return { last_attempt: attemptedAt, last_success: attemptedAt, last_error_category: null, failure_count: 0, cursor }
  }
  return {
    last_attempt: attemptedAt,
    last_error_category: errorCategory || 'gmail_collector_failed',
    failure_count: Number(prior?.failure_count ?? 0) + 1,
    cursor,
  }
}
