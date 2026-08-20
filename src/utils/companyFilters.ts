import type { Company, CompanyFilters } from '../types'
import { getDaysUntil, getMostUrgentEvent } from './deadlines'
import { calculateOverallScore } from './scoring'

export function filterAndSortCompanies(
  companies: Company[],
  filters: CompanyFilters,
  now = new Date(),
): Company[] {
  const query = filters.query.trim().toLocaleLowerCase('ja')

  return companies
    .filter((company) => {
      const searchable = [
        company.name,
        company.role,
        company.applicationCategory,
        company.webTest,
        company.codingTest,
        company.memo,
      ]
        .join(' ')
        .toLocaleLowerCase('ja')
      if (query && !searchable.includes(query)) return false
      if (filters.status !== 'すべて' && company.status !== filters.status) return false
      if (filters.priority !== 'すべて' && company.priority !== filters.priority) return false
      if (
        filters.eligibility !== 'すべて' &&
        ![
          company.graduateEligibility,
          company.existingGraduateEligibility,
          company.workExperienceEligibility,
        ].includes(filters.eligibility)
      ) {
        return false
      }

      const urgent = getMostUrgentEvent(company, now)
      const days = urgent ? getDaysUntil(urgent.scheduledAt, now) : null
      if (filters.deadline === '7日以内' && !(days !== null && days >= 0 && days <= 7)) return false
      if (filters.deadline === '期限超過' && !(days !== null && days < 0)) return false
      if (filters.deadline === '期限なし' && days !== null) return false
      return true
    })
    .sort((a, b) => {
      if (filters.sort === '総合点が高い順') {
        return calculateOverallScore(b.scores, b.interest) - calculateOverallScore(a.scores, a.interest)
      }
      if (filters.sort === '更新が新しい順') {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      }
      if (filters.sort === '企業名順') return a.name.localeCompare(b.name, 'ja')

      const aDate = getMostUrgentEvent(a, now)?.scheduledAt
      const bDate = getMostUrgentEvent(b, now)?.scheduledAt
      if (!aDate && !bDate) return a.name.localeCompare(b.name, 'ja')
      if (!aDate) return 1
      if (!bDate) return -1
      return new Date(aDate).getTime() - new Date(bDate).getTime()
    })
}

