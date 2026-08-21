import type { AppDataV2 } from '../domain/types'
import { createDemoCompanies } from './demoData'
import { migrateV1Companies } from '../domain/migration'

const masterIds: Record<string, string> = {
  'demo-company-1': 'cmp_demo_sample_tech_01',
  'demo-company-2': 'cmp_demo_mirai_digital_01',
  'demo-company-3': 'cmp_demo_hokusei_cloud_01',
  'demo-company-4': 'cmp_demo_aozora_product_01',
}

export function createDemoAppData(): AppDataV2 {
  const data = migrateV1Companies(createDemoCompanies(), {
    now: '2026-08-21T00:00:00.000Z',
    sourceKey: 'built-in-demo-v1',
    backupKey: 'not-applicable',
  })
  const balance = data.scoringProfiles.find((profile) => profile.id === 'profile_general_v2')!
  const legacyByCompany = new Map(data.evaluations.map((evaluation) => [evaluation.userCompanyId, evaluation]))
  const balanceEvaluations = data.userCompanies.map((company) => {
    const values = legacyByCompany.get(company.id)?.values ?? {}
    const toTen = (value: unknown) => typeof value === 'number' ? value * 2 : null
    return {
      id: `evaluation_demo_balance_${company.id}`,
      userCompanyId: company.id,
      scoringProfileId: balance.id,
      values: {
        criterion_general_compensation: (() => { const salary = toTen(values.criterion_legacy_salary); const benefits = toTen(values.criterion_legacy_benefits); return salary === null || benefits === null ? null : (salary + benefits) / 2 })(),
        criterion_general_wlb: toTen(values.criterion_legacy_wlb),
        criterion_general_role_fit: toTen(values.criterion_legacy_it_fit),
        criterion_general_flexibility: (() => { const remote = toTen(values.criterion_legacy_remote); const flex = toTen(values.criterion_legacy_flex); return remote === null || flex === null ? null : (remote + flex) / 2 })(),
        criterion_general_benefits: toTen(values.criterion_legacy_benefits),
        criterion_general_location: null,
        criterion_general_stability: null,
        criterion_general_global: toTen(values.criterion_legacy_overseas),
      },
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    }
  })
  return {
    ...data,
    revision: 0,
    activeScoringProfileId: balance.id,
    evaluations: balanceEvaluations,
    userCompanies: data.userCompanies.map((company) => ({
      ...company,
      masterCompanyId: masterIds[company.id] ?? null,
    })),
    researchFacts: data.researchFacts.map((fact) => ({
      ...fact,
      masterCompanyId: fact.userCompanyId ? masterIds[fact.userCompanyId] ?? null : null,
    })),
    migrationHistory: [],
    updatedAt: '2026-08-21T00:00:00.000Z',
  }
}
