import { describe, expect, it } from 'vitest'
import { approveCollectorFinding } from './collectorFindings'

describe('approveCollectorFinding', () => {
  it('normalizes database timestamps before creating formal watch data', () => {
    const watch = approveCollectorFinding({ id: 'f', company: null, findingType: 'deadline', payload: {}, sourceType: 'gmail', sourceExternalId: null, sourceUrl: null, sourceTimestamp: null, observedAt: '2026-08-26 12:34:13+00', confidence: 0.4, evidenceExcerpt: 'example', fingerprint: 'f', status: 'new', reviewReason: null }, 'company', '2026-08-26T00:00:00.000Z')
    expect(watch.detectedAt).toBe('2026-08-26T12:34:13.000Z')
    expect(watch.source?.retrievedAt).toBe('2026-08-26T12:34:13.000Z')
  })
})
