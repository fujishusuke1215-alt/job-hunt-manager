export type TriageAction = 'auto_approved' | 'auto_archived' | 'manual_review'
export type FindingClassification = 'entry_completed' | 'deadline' | 'web_test' | 'interview' | 'reservation_required' | 'event' | 'internship' | 'result_notice' | 'mypage_action_required' | 'document_required' | 'general_info' | 'marketing' | 'unknown'

export interface TriageTarget {
  candidateCompanyId: string
  canonicalName: string
  aliases: string[]
  senderDomains: string[]
  officialUrl?: string | null
  mypageUrl?: string | null
}

export interface TriageFinding {
  company: string | null
  findingType: string
  payload: Record<string, unknown>
  sourceType: 'gmail' | 'web' | 'manual'
  sourceUrl: string | null
  evidenceExcerpt: string
}

export interface TriageDecision {
  action: TriageAction
  classification: FindingClassification
  target: TriageTarget | null
  confidence: number
  ambiguous: boolean
  reason: string
}

const corporateSuffix = /(?:株式会社|有限会社|合同会社|（株）|\(株\)|㈱)/g
const decorations = /[\s・･,，.．:：;；【】（）()「」『』]/g

export function normalizeCompanyName(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US').replace(corporateSuffix, '').replace(decorations, '')
}

function subjectOf(finding: TriageFinding): string {
  return typeof finding.payload.subject === 'string' ? finding.payload.subject : finding.evidenceExcerpt
}

function senderDomain(finding: TriageFinding): string | null {
  const sender = typeof finding.payload.sender === 'string' ? finding.payload.sender : ''
  const match = sender.match(/@([a-z0-9.-]+\.[a-z]{2,})/i)
  return match?.[1].toLowerCase() ?? null
}

function hostOf(value: string | null | undefined): string | null {
  if (!value) return null
  try { return new URL(value).hostname.toLowerCase() } catch { return null }
}

function sameOrSubdomain(actual: string | null, expected: string | null | undefined): boolean {
  if (!actual || !expected) return false
  const normalized = expected.toLowerCase().replace(/^@/, '')
  return actual === normalized || actual.endsWith(`.${normalized}`)
}

function classify(text: string, findingType: string): FindingClassification {
  if (/(エントリー|応募).{0,12}(受付|受け付け|ありがとう|完了)|エントリーありがとうございます/.test(text)) return 'entry_completed'
  if (/ES.{0,16}(提出完了|受領)|エントリーシート.{0,16}(提出完了|受領)/i.test(text)) return 'general_info'
  if (/Webテスト|適性検査/.test(text)) return 'web_test'
  if (/面接/.test(text)) return 'interview'
  if (/予約.{0,12}(完了|確定)|ご予約/.test(text)) return 'reservation_required'
  if (/マイページ.{0,20}(確認|手続|対応)/.test(text)) return 'mypage_action_required'
  if (/提出書類|書類.{0,12}(提出|確認)/.test(text)) return 'document_required'
  if (/締切|までに提出/.test(text) || findingType === 'deadline') return 'deadline'
  if (/結果|合格|不合格/.test(text)) return 'result_notice'
  if (/インターン/.test(text)) return 'internship'
  if (/説明会|イベント/.test(text)) return 'event'
  if (/メルマガ|ニュースレター|採用コンテンツ|業界研究|コラム|セミナー情報/.test(text)) return 'marketing'
  if (findingType === 'general_recruiting_information') return 'general_info'
  return 'unknown'
}

function candidateMatch(finding: TriageFinding, targets: readonly TriageTarget[]): { target: TriageTarget | null; confidence: number; ambiguous: boolean; reason: string } {
  const subject = normalizeCompanyName(subjectOf(finding))
  const sender = senderDomain(finding)
  const sourceHost = hostOf(finding.sourceUrl)
  const matches = targets.flatMap((target) => {
    const names = [target.canonicalName, ...target.aliases].map(normalizeCompanyName).filter((name) => name.length >= 2)
    const nameMatch = names.filter((name) => subject.includes(name)).sort((a, b) => b.length - a.length)[0] ?? null
    const trustedDomain = target.senderDomains.some((domain) => sameOrSubdomain(sender, domain))
    const trustedUrl = [target.officialUrl, target.mypageUrl].some((url) => sameOrSubdomain(sourceHost, hostOf(url)))
    if (!nameMatch && !trustedDomain && !trustedUrl) return []
    const canonical = normalizeCompanyName(target.canonicalName)
    const exactCanonical = nameMatch === canonical
    const exactAlias = Boolean(nameMatch) && !exactCanonical
    const confidence = exactCanonical && trustedDomain ? 1 : exactAlias && trustedDomain ? .98 : exactCanonical ? .95 : exactAlias ? .90 : trustedDomain ? .80 : .75
    return [{ target, confidence, exactLength: nameMatch?.length ?? 0, reason: exactCanonical ? 'subject_canonical_exact' : exactAlias ? 'subject_alias_exact' : trustedDomain ? 'trusted_sender_domain' : 'trusted_url_domain' }]
  })
  if (!matches.length) return { target: null, confidence: 0, ambiguous: false, reason: 'no_company_evidence' }
  matches.sort((a, b) => b.confidence - a.confidence || b.exactLength - a.exactLength)
  const best = matches[0]
  // An equally strong match for a different legal target is never auto-selected.
  const ambiguous = matches.slice(1).some((match) => match.confidence === best.confidence && match.exactLength === best.exactLength && match.target.candidateCompanyId !== best.target.candidateCompanyId)
  return { target: ambiguous ? null : best.target, confidence: best.confidence, ambiguous, reason: ambiguous ? 'ambiguous_company_match' : best.reason }
}

export function triageCollectorFinding(finding: TriageFinding, targets: readonly TriageTarget[], now = new Date()): TriageDecision {
  const match = candidateMatch(finding, targets)
  const text = `${subjectOf(finding)}\n${finding.evidenceExcerpt}`
  const classification = classify(text, finding.findingType)
  const explicitEntry = classification === 'entry_completed' && /(受付|受け付け|ありがとう|完了)/.test(text)
  const deadline = typeof finding.payload.deadline === 'string' ? new Date(finding.payload.deadline) : null
  const expiredOptional = (classification === 'marketing' || classification === 'event') && deadline && !Number.isNaN(deadline.getTime()) && deadline < now
  if (match.target && !match.ambiguous && match.confidence >= .9 && explicitEntry) return { action: 'auto_approved', classification, ...match, reason: `${match.reason}:explicit_entry_completed` }
  if (match.target && !match.ambiguous && match.confidence >= .9 && (classification === 'marketing' || expiredOptional)) return { action: 'auto_archived', classification, ...match, reason: `${match.reason}:${classification === 'marketing' ? 'marketing' : 'expired_optional_event'}` }
  return { action: 'manual_review', classification, ...match, reason: match.ambiguous ? match.reason : `${match.reason}:${classification}` }
}
