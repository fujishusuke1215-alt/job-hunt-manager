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
  return {
    ...data,
    revision: 0,
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

