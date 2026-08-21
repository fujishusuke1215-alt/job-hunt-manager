import type { AppDataV2, CatalogData, CompanyEvaluation, CompanyView, MasterCompany, ScoringProfile } from './types'
import { resolveCanonicalMaster } from './companyMatching'
import { calculateScore } from './scoring'

export function getActiveScoringProfile(data: AppDataV2): ScoringProfile {
  return data.scoringProfiles.find((profile) => profile.id === data.activeScoringProfileId)
    ?? data.scoringProfiles[0]
}

export function getEvaluation(
  data: AppDataV2,
  userCompanyId: string,
  scoringProfileId = data.activeScoringProfileId,
): CompanyEvaluation | null {
  return data.evaluations.find(
    (evaluation) => evaluation.userCompanyId === userCompanyId && evaluation.scoringProfileId === scoringProfileId,
  ) ?? null
}

export function getCompanyViews(data: AppDataV2, catalog: CatalogData): CompanyView[] {
  const profile = getActiveScoringProfile(data)
  return data.userCompanies.map((company) => {
    const master: MasterCompany | null = company.masterCompanyId
      ? resolveCanonicalMaster(company.masterCompanyId, catalog)
      : null
    const evaluation = getEvaluation(data, company.id, profile.id)
    return {
      company,
      displayName: master?.displayName ?? company.userEnteredName,
      master,
      facts: data.researchFacts.filter((fact) => fact.userCompanyId === company.id || (
        master && fact.masterCompanyId === master.id
      )),
      evaluation,
      score: calculateScore(profile, evaluation),
    }
  })
}

export function rankCompanyViews(views: CompanyView[]): Array<CompanyView & { rank: number }> {
  const sorted = [...views].sort((a, b) => {
    if (a.score.score === null && b.score.score === null) return a.displayName.localeCompare(b.displayName, 'ja')
    if (a.score.score === null) return 1
    if (b.score.score === null) return -1
    return b.score.score - a.score.score
      || b.score.coverage - a.score.coverage
      || a.displayName.localeCompare(b.displayName, 'ja')
      || a.company.id.localeCompare(b.company.id)
  })

  let previousScore: number | null = null
  let previousRank = 0
  return sorted.map((view, index) => {
    const rank = view.score.score !== null && previousScore === view.score.score
      ? previousRank
      : index + 1
    previousScore = view.score.score
    previousRank = rank
    return { ...view, rank }
  })
}

