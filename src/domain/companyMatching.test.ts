import { describe, expect, it } from 'vitest'
import { demoCatalog } from '../data/catalogData'
import { findMasterCandidates, linkUserCompanyToMaster, normalizeCompanyName, resolveCanonicalMaster } from './companyMatching'
import type { UserCompany } from './types'

const company: UserCompany = {
  id: 'user-company-1',
  masterCompanyId: null,
  userEnteredName: 'サンプルテック株式会社',
  role: '開発職',
  applicationCategory: '新卒',
  manualPriority: 'A',
  interest: 5,
  applicationStatus: '面接待ち',
  myPageStatus: '開設済み',
  applicationUrl: 'https://example.com/apply',
  memo: '保持すべきメモ',
  watchEnabled: true,
  events: [{ id: 'event-1', type: '面接', title: '一次面接', scheduledAt: '2026-09-01T10:00', status: '予定', location: '', memo: '' }],
  createdAt: '2026-08-21T00:00:00.000Z',
  updatedAt: '2026-08-21T00:00:00.000Z',
}

describe('company master matching', () => {
  it('法人表記と全角半角を候補検索用に正規化する', () => {
    expect(normalizeCompanyName(' 株式会社 ＳＡＭＰＬＥ　ＴＥＣＨ ')).toBe('sample tech')
  })

  it('法人格と安全な引用符の表記揺れを同一視する', () => {
    const variants = ['NTTドコモ', '株式会社NTTドコモ', '"株式会社NTTドコモ"', '“株式会社ＮＴＴドコモ”', '「NTTドコモ株式会社」']
    expect(new Set(variants.map(normalizeCompanyName))).toEqual(new Set(['nttドコモ']))
  })

  it('グループ会社は部分一致では同一視しない', () => {
    expect(normalizeCompanyName('NTTデータ')).not.toBe(normalizeCompanyName('NTTデータ関西'))
    expect(normalizeCompanyName('ソニー')).not.toBe(normalizeCompanyName('ソニーグループ'))
    expect(normalizeCompanyName('パナソニック')).not.toBe(normalizeCompanyName('パナソニック コネクト'))
  })

  it('masterCompanyIdが存在すればcanonical masterへ確定する', () => {
    const result = findMasterCandidates({ masterCompanyId: 'cmp_demo_old_product_01' }, demoCatalog)
    expect(result.status).toBe('confirmed')
    expect(result.status === 'confirmed' && result.master.id).toBe('cmp_demo_aozora_product_01')
    expect(resolveCanonicalMaster('cmp_demo_old_product_01', demoCatalog)?.status).toBe('active')
  })

  it('aliasとdomainは候補を提示するが自動確定しない', () => {
    const alias = findMasterCandidates({ companyName: 'サンプルテック株式会社' }, demoCatalog)
    const domain = findMasterCandidates({ officialDomain: 'https://www.sample-tech.example.com/careers' }, demoCatalog)
    expect(alias.status).toBe('candidates')
    expect(domain.status).toBe('candidates')
    expect(domain.candidates[0].reasons).toContain('official_domain')
  })

  it('候補なしは独自企業として扱える', () => {
    expect(findMasterCandidates({ companyName: '架空の独自企業' }, demoCatalog).status).toBe('none')
  })

  it('後からmasterへlinkしても本人データを保持する', () => {
    const linked = linkUserCompanyToMaster(company, 'cmp_demo_sample_tech_01', demoCatalog)
    expect(linked.masterCompanyId).toBe('cmp_demo_sample_tech_01')
    expect(linked.memo).toBe(company.memo)
    expect(linked.events).toEqual(company.events)
    expect(linked.interest).toBe(company.interest)
  })
})
