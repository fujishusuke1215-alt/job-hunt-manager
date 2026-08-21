import { describe, expect, it } from 'vitest'
import { calculateScore } from './scoring'
import {
  V1_BACKUP_PREFIX,
  V1_STORAGE_KEY,
  createEmptyAppData,
  migrateV1Companies,
  parseLegacyV1,
} from './migration'
import { safeParseAppDataV2 } from './schemas'
import type { LegacyCompanyV1 } from './v1'

const now = '2026-08-21T00:00:00.000Z'

function makeLegacyCompany(id: string, overrides: Partial<LegacyCompanyV1> = {}): LegacyCompanyV1 {
  return {
    id,
    name: `架空企業 ${id}`,
    role: '開発職',
    applicationCategory: '新卒',
    priority: 'A',
    interest: 4,
    status: '面接待ち',
    graduateEligibility: '応募可',
    existingGraduateEligibility: '要確認',
    workExperienceEligibility: '応募可',
    webTest: '架空テスト',
    codingTest: 'あり',
    myPageStatus: '開設済み',
    applicationUrl: 'https://example.test/apply',
    memo: `引き継ぐメモ ${id}`,
    scores: {
      salary: 4,
      benefits: 3,
      wlb: 5,
      remote: 2,
      flex: 4,
      overseas: 1,
      itFit: 5,
    },
    events: [{
      id: `event_${id}`,
      type: '面接',
      title: '一次面接',
      scheduledAt: '2026-08-25T01:00:00.000Z',
      status: '予定',
      location: 'オンライン',
      memo: '接続URLを確認',
    }],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-08-20T12:00:00.000Z',
    ...overrides,
  }
}

function legacyOverall(company: LegacyCompanyV1): number {
  const clamp = (value: number) => Math.min(5, Math.max(0, value))
  const compensation = (clamp(company.scores.salary) + clamp(company.scores.benefits)) / 2
  const flexibility = (clamp(company.scores.remote) + clamp(company.scores.flex)) / 2
  const fivePointScore =
    compensation * 0.2
    + clamp(company.scores.wlb) * 0.25
    + flexibility * 0.15
    + clamp(company.scores.overseas) * 0.1
    + clamp(company.scores.itFit) * 0.15
    + clamp(company.interest) * 0.15

  return Math.round(fivePointScore * 20 * 10) / 10
}

describe('migrateV1Companies', () => {
  it('企業数、ID、選考予定、メモ、作成・更新時刻を維持する', () => {
    const companies = [
      makeLegacyCompany('company_alpha'),
      makeLegacyCompany('company_beta', {
        memo: '二社目の大切なメモ',
        events: [
          {
            id: 'event_beta_es',
            type: 'ES',
            title: 'ES締切',
            scheduledAt: '2026-08-24T14:59:00.000Z',
            status: '予定',
            location: '',
            memo: '提出前に校正',
          },
          {
            id: 'event_beta_test',
            type: 'Webテスト',
            title: '適性検査',
            scheduledAt: '2026-08-27T14:59:00.000Z',
            status: '予定',
            location: 'オンライン',
            memo: '',
          },
        ],
      }),
    ]

    const result = migrateV1Companies(companies, { now })

    expect(result.userCompanies).toHaveLength(companies.length)
    expect(result.userCompanies.map((company) => company.id)).toEqual(companies.map((company) => company.id))
    expect(result.userCompanies[0].events).toEqual(companies[0].events)
    expect(result.userCompanies[1].events).toEqual(companies[1].events)
    expect(result.userCompanies[1].memo).toBe('二社目の大切なメモ')
    expect(result.userCompanies[0].createdAt).toBe(companies[0].createdAt)
    expect(result.userCompanies[0].updatedAt).toBe(companies[0].updatedAt)
    expect(safeParseAppDataV2(result).success).toBe(true)
  })

  it('Legacy v1をactive profileにし、旧固定式の点数を再現する', () => {
    const companies = [
      makeLegacyCompany('company_alpha'),
      makeLegacyCompany('company_beta', {
        interest: 2,
        scores: {
          salary: 1,
          benefits: 5,
          wlb: 2,
          remote: 5,
          flex: 1,
          overseas: 4,
          itFit: 3,
        },
      }),
    ]

    const result = migrateV1Companies(companies, { now })
    const legacyProfile = result.scoringProfiles.find(
      (profile) => profile.id === result.activeScoringProfileId,
    )

    expect(legacyProfile?.name).toBe('Legacy v1')
    expect(legacyProfile?.kind).toBe('legacy')
    for (const company of companies) {
      const evaluation = result.evaluations.find((item) => item.userCompanyId === company.id)
      expect(evaluation).toBeDefined()
      expect(calculateScore(legacyProfile!, evaluation!).score).toBeCloseTo(legacyOverall(company), 5)
    }
  })

  it('情報源のなかった採用情報をlegacy・unverified・未確認のFactとして保持する', () => {
    const company = makeLegacyCompany('company_alpha', {
      applicationUrl: 'javascript:alert(1)',
    })

    const result = migrateV1Companies([company], { now })
    const facts = result.researchFacts.filter((fact) => fact.userCompanyId === company.id)

    expect(facts).toHaveLength(6)
    expect(facts.map((fact) => fact.key)).toEqual(expect.arrayContaining([
      'eligibility_graduate',
      'eligibility_existing_graduate',
      'eligibility_work_experience',
      'web_test',
      'coding_test',
      'application_url',
    ]))
    for (const fact of facts) {
      expect(fact.verificationLevel).toBe('unverified')
      expect(fact.checkedAt).toBeNull()
      expect(fact.reviewStatus).toBe('stale')
      expect(fact.processedByAi).toBe(false)
      expect(fact.sources).toHaveLength(1)
      expect(fact.sources[0].type).toBe('legacy')
      expect(fact.sources[0].retrievedAt).toBeNull()
    }
    expect(result.userCompanies[0].applicationUrl).toBe('')
    expect(facts.find((fact) => fact.key === 'application_url')?.value).toBe('javascript:alert(1)')
  })

  it('移行履歴に移行元、退避先、件数を記録する', () => {
    const result = migrateV1Companies(
      [makeLegacyCompany('company_alpha')],
      {
        now,
        sourceKey: V1_STORAGE_KEY,
        backupKey: `${V1_BACKUP_PREFIX}test`,
      },
    )

    expect(result.migrationHistory).toHaveLength(1)
    expect(result.migrationHistory[0]).toMatchObject({
      fromVersion: 1,
      toVersion: 2,
      migratedAt: now,
      sourceKey: V1_STORAGE_KEY,
      backupKey: `${V1_BACKUP_PREFIX}test`,
    })
    expect(result.migrationHistory[0].summary).toContain('1社')
  })
})

describe('parseLegacyV1', () => {
  it('localStorage由来のCompany配列とv1バックアップ形式を受け付ける', () => {
    const companies = [makeLegacyCompany('company_alpha')]
    const backup = {
      schemaVersion: 1,
      exportedAt: now,
      companies,
    }

    expect(parseLegacyV1(JSON.stringify(companies))).toEqual(companies)
    expect(parseLegacyV1(JSON.stringify(backup))).toEqual(companies)
  })

  it('不正なv1を拒否し、既存v2データを変更しない', () => {
    const current = createEmptyAppData(now)
    const before = structuredClone(current)
    const invalid = [{ ...makeLegacyCompany('company_alpha'), id: '' }]

    expect(() => parseLegacyV1(JSON.stringify(invalid))).toThrow('元データは変更していません')
    expect(current).toEqual(before)
  })
})
