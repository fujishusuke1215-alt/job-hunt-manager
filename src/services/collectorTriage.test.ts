import { describe, expect, it } from 'vitest'
import { triageCollectorFinding, type TriageTarget } from './collectorTriage'

const targets: TriageTarget[] = [
  { candidateCompanyId: 'scsk', canonicalName: 'SCSK', aliases: ['SCSK株式会社'], senderDomains: ['scsk.jp'] },
  { candidateCompanyId: 'ntt-data', canonicalName: 'NTTデータ', aliases: ['NTT DATA'], senderDomains: ['nttdata.com'] },
  { candidateCompanyId: 'ntt-data-i', canonicalName: 'NTTデータアイ', aliases: [], senderDomains: ['nttdata-i.com'] },
]
const finding = (subject: string, extra: Record<string, unknown> = {}) => ({ company: null, findingType: 'unknown', payload: { subject, ...extra }, sourceType: 'gmail' as const, sourceUrl: null, evidenceExcerpt: subject })

describe('triageCollectorFinding', () => {
  it('auto-approves an explicit entry receipt with an exact alias', () => {
    const result = triageCollectorFinding(finding('【SCSK株式会社】エントリーありがとうございます'), targets)
    expect(result.action).toBe('auto_approved')
    expect(result.target?.candidateCompanyId).toBe('scsk')
    expect(result.confidence).toBeGreaterThanOrEqual(.9)
  })
  it('uses a trusted sender domain when the subject has no name', () => {
    const result = triageCollectorFinding({ ...finding('エントリーありがとうございます', { sender: '採用 <info@scsk.jp>' }), evidenceExcerpt: 'エントリーありがとうございます' }, targets)
    expect(result.target?.candidateCompanyId).toBe('scsk')
    expect(result.confidence).toBe(.8)
    expect(result.action).toBe('manual_review')
  })
  it('does not confuse a group company with its parent by partial text', () => {
    const result = triageCollectorFinding(finding('【NTTデータアイ】エントリーありがとうございます'), targets)
    expect(result.target?.candidateCompanyId).toBe('ntt-data-i')
  })
  it('archives clearly marketing-only mail', () => {
    const result = triageCollectorFinding(finding('【SCSK】採用コンテンツのお知らせ'), targets)
    expect(result.action).toBe('auto_archived')
  })
  it('keeps unknown companies in manual review', () => {
    expect(triageCollectorFinding(finding('お知らせ'), targets).action).toBe('manual_review')
  })
})
