import { describe, expect, it } from 'vitest'
import { approveCollectorFinding } from './collectorFindings'

describe('approveCollectorFinding', () => {
  it('normalizes database timestamps before creating formal watch data', () => {
    const watch = approveCollectorFinding({ id: 'f', company: null, findingType: 'deadline', payload: { deadline: '2026-08-28 09:00:00+00' }, sourceType: 'gmail', sourceExternalId: null, sourceUrl: null, sourceTimestamp: '2026-08-26 12:34:13+00', observedAt: '2026-08-26 12:34:13+00', confidence: 0.4, evidenceExcerpt: 'example', fingerprint: 'f', status: 'new', reviewReason: null }, 'company', '2026-08-26T00:00:00.000Z')
    expect(watch.detectedAt).toBe('2026-08-26T12:34:13.000Z')
    expect(watch.source?.retrievedAt).toBe('2026-08-26T12:34:13.000Z')
    expect(watch.source?.publishedAt).toBe('2026-08-26T12:34:13.000Z')
    expect(watch.deadline).toBe('2026-08-28T09:00:00.000Z')
  })

  it('isolates an unparseable source timestamp instead of blocking the save', () => {
    const watch = approveCollectorFinding({ id: 'f', company: null, findingType: 'deadline', payload: {}, sourceType: 'web', sourceExternalId: null, sourceUrl: null, sourceTimestamp: 'legacy date', observedAt: '2026-08-26T12:34:13.000Z', confidence: 0.4, evidenceExcerpt: 'example', fingerprint: 'f', status: 'new', reviewReason: null }, 'company')
    expect(watch.source?.publishedAt).toBeNull()
  })
})
