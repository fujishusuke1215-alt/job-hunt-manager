import { describe, expect, it } from 'vitest'
import { urgentPendingCollectorFindings } from './collectorUrgency'
import type { CollectorFinding } from './collectorFindings'

const finding = (findingType: string, observedAt: string, status: CollectorFinding['status'] = 'new'): CollectorFinding => ({ id: `${findingType}-${observedAt}`, company: null, findingType, payload: {}, sourceType: 'gmail', sourceExternalId: null, sourceUrl: null, sourceTimestamp: null, observedAt, confidence: 0.4, evidenceExcerpt: 'example', fingerprint: `${findingType}-${observedAt}`, status, reviewReason: null })

describe('urgentPendingCollectorFindings', () => {
  it('keeps pending action candidates separate from formal data and prioritizes deadline candidates', () => {
    const result = urgentPendingCollectorFindings([finding('unknown', '2026-08-26T00:00:00Z'), finding('test', '2026-08-26T00:00:00Z'), finding('deadline', '2026-08-25T00:00:00Z'), finding('deadline', '2026-08-26T00:00:00Z'), finding('deadline', '2026-08-26T00:00:00Z', 'approved')])
    expect(result.map((item) => item.findingType)).toEqual(['deadline', 'deadline', 'test'])
    expect(result[0].observedAt).toBe('2026-08-26T00:00:00Z')
  })
})
