import type { CatalogData, MasterCompany, UserCompany } from './types'

const corporateDesignators = [
  '株式会社',
  '有限会社',
  '合同会社',
  '(株)',
  '（株）',
  'inc.',
  'inc',
  'corporation',
  'corp.',
  'corp',
  'co.,ltd.',
  'co., ltd.',
  'co ltd',
]

export function normalizeCompanyName(value: string): string {
  let normalized = value.normalize('NFKC').trim().toLocaleLowerCase('ja')
  for (const designator of corporateDesignators) {
    normalized = normalized.replaceAll(designator.normalize('NFKC').toLocaleLowerCase('ja'), ' ')
  }
  return normalized.replace(/\s+/g, ' ').trim()
}

export function normalizeDomain(value: string): string {
  const trimmed = value.trim().toLocaleLowerCase('en')
  if (!trimmed) return ''
  try {
    const url = trimmed.includes('://') ? new URL(trimmed) : new URL(`https://${trimmed}`)
    return url.hostname.replace(/^www\./, '')
  } catch {
    return trimmed.replace(/^www\./, '').split('/')[0]
  }
}

export function resolveCanonicalMaster(
  masterCompanyId: string,
  catalog: CatalogData,
): MasterCompany | null {
  const visited = new Set<string>()
  let current = catalog.masterCompanies.find((item) => item.id === masterCompanyId) ?? null
  while (current?.status === 'merged' && current.mergedIntoId) {
    if (visited.has(current.id)) return null
    visited.add(current.id)
    current = catalog.masterCompanies.find((item) => item.id === current?.mergedIntoId) ?? null
  }
  return current
}

export interface MasterCandidate {
  master: MasterCompany
  reasons: Array<'explicit_id' | 'official_domain' | 'normalized_name'>
}

export type MasterMatchResult =
  | { status: 'confirmed'; master: MasterCompany; candidates: MasterCandidate[] }
  | { status: 'candidates'; master: null; candidates: MasterCandidate[] }
  | { status: 'none'; master: null; candidates: [] }

export function findMasterCandidates(
  input: { masterCompanyId?: string | null; companyName?: string; officialDomain?: string | null },
  catalog: CatalogData,
): MasterMatchResult {
  if (input.masterCompanyId) {
    const explicit = resolveCanonicalMaster(input.masterCompanyId, catalog)
    if (explicit) {
      return { status: 'confirmed', master: explicit, candidates: [{ master: explicit, reasons: ['explicit_id'] }] }
    }
  }

  const name = normalizeCompanyName(input.companyName ?? '')
  const domain = normalizeDomain(input.officialDomain ?? '')
  const matches = new Map<string, MasterCandidate>()

  for (const rawMaster of catalog.masterCompanies) {
    const master = resolveCanonicalMaster(rawMaster.id, catalog)
    if (!master || master.status !== 'active') continue
    const reasons: MasterCandidate['reasons'] = []
    const names = [master.legalName, master.displayName, ...master.aliases, ...master.formerNames]
    if (name && names.some((candidate) => normalizeCompanyName(candidate) === name)) reasons.push('normalized_name')
    if (domain && master.officialDomains.some((candidate) => normalizeDomain(candidate) === domain)) reasons.push('official_domain')
    if (reasons.length === 0) continue
    const previous = matches.get(master.id)
    matches.set(master.id, {
      master,
      reasons: [...new Set([...(previous?.reasons ?? []), ...reasons])],
    })
  }

  const candidates = [...matches.values()].sort((a, b) => {
    const aDomain = a.reasons.includes('official_domain') ? 1 : 0
    const bDomain = b.reasons.includes('official_domain') ? 1 : 0
    return bDomain - aDomain || a.master.displayName.localeCompare(b.master.displayName, 'ja')
  })
  if (candidates.length === 0) return { status: 'none', master: null, candidates: [] }
  return { status: 'candidates', master: null, candidates }
}

export function linkUserCompanyToMaster(
  company: UserCompany,
  masterCompanyId: string | null,
  catalog: CatalogData,
  now = new Date().toISOString(),
): UserCompany {
  if (masterCompanyId && !resolveCanonicalMaster(masterCompanyId, catalog)) {
    throw new Error('指定した企業マスタが見つかりません。')
  }
  return { ...company, masterCompanyId, updatedAt: now }
}

