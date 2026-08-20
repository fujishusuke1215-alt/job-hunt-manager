import type { CompanyFilters } from '../types'

export const defaultFilters: CompanyFilters = {
  query: '',
  status: 'すべて',
  priority: 'すべて',
  eligibility: 'すべて',
  deadline: 'すべて',
  sort: '締切が近い順',
}
