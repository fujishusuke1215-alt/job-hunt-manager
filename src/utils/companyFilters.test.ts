import { describe, expect, it } from 'vitest'
import { createDemoCompanies } from '../data/demoData'
import { defaultFilters } from '../data/defaults'
import { filterAndSortCompanies } from './companyFilters'

describe('filterAndSortCompanies', () => {
  it('企業名とメモを検索できる', () => {
    const result = filterAndSortCompanies(createDemoCompanies(), { ...defaultFilters, query: 'バックエンド' })
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('株式会社サンプルテック')
  })

  it('ステータスと優先度を同時に絞り込める', () => {
    const result = filterAndSortCompanies(createDemoCompanies(), {
      ...defaultFilters,
      status: '面接待ち',
      priority: 'A',
    })
    expect(result.map((company) => company.name)).toEqual(['みらいデジタル株式会社'])
  })

  it('総合点が高い順に並べる', () => {
    const result = filterAndSortCompanies(createDemoCompanies(), { ...defaultFilters, sort: '総合点が高い順' })
    expect(result[0].name).toBe('みらいデジタル株式会社')
  })
})
