import type { AppDataV2, ResearchFact, ResearchSource, UserCompany } from './types'
import type { LegacyCompanyV1 } from './v1'
import { legacyBackupV1Schema, legacyCompaniesV1Schema } from './v1'
import { createDeveloperReferenceProfile, createGeneralScoringProfile, createLegacyV1Profile } from './scoring'
import { createId } from '../utils/id'

export const V1_STORAGE_KEY = 'job-hunt-manager:personal-companies:v1'
export const V2_STORAGE_KEY = 'job-hunt-manager:app-data:v2'
export const V1_BACKUP_PREFIX = 'job-hunt-manager:legacy-backup:v1:'

const safeApplicationUrl = (value: string) => {
  if (!value) return ''
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? value : ''
  } catch {
    return ''
  }
}

function legacySource(companyId: string): ResearchSource {
  return {
    id: `source_legacy_${companyId}`,
    type: 'legacy',
    title: 'v1移行データ',
    url: null,
    retrievedAt: null,
    publishedAt: null,
    note: '情報源が保存されていなかったv1から移行。応募前に再確認が必要。',
  }
}

function legacyFacts(company: LegacyCompanyV1, now: string): ResearchFact[] {
  const source = legacySource(company.id)
  const values = [
    ['eligibility_graduate', '新卒応募', company.graduateEligibility],
    ['eligibility_existing_graduate', '既卒応募', company.existingGraduateEligibility],
    ['eligibility_work_experience', '職歴あり応募', company.workExperienceEligibility],
    ['web_test', 'Webテスト', company.webTest],
    ['coding_test', 'コーディングテスト', company.codingTest],
    ['application_url', '応募URL', company.applicationUrl],
  ] as const

  return values.map(([key, label, value]) => ({
    id: `fact_legacy_${company.id}_${key}`,
    userCompanyId: company.id,
    masterCompanyId: null,
    key,
    label,
    value,
    recruitingCycle: null,
    roleScope: company.role || null,
    checkedAt: null,
    verificationLevel: 'unverified',
    reviewStatus: 'stale',
    processedByAi: false,
    sources: [source],
    createdAt: company.createdAt || now,
    updatedAt: company.updatedAt || now,
  }))
}

export function parseLegacyV1(raw: string): LegacyCompanyV1[] {
  const parsed: unknown = JSON.parse(raw)
  const arrayResult = legacyCompaniesV1Schema.safeParse(parsed)
  if (arrayResult.success) return arrayResult.data
  const backupResult = legacyBackupV1Schema.safeParse(parsed)
  if (backupResult.success) return backupResult.data.companies
  throw new Error('v1データの検証に失敗しました。元データは変更していません。')
}

export function createEmptyAppData(now = new Date().toISOString()): AppDataV2 {
  const general = createGeneralScoringProfile(now)
  return {
    schemaVersion: 2,
    revision: 0,
    userCompanies: [],
    researchFacts: [],
    scoringProfiles: [general, createDeveloperReferenceProfile(now)],
    activeScoringProfileId: general.id,
    evaluations: [],
    watchRuns: [],
    watchFindings: [],
    userSettings: { includePersonalNotesInAiExport: false, locale: 'ja-JP' },
    migrationHistory: [],
    aiImportHistory: [],
    processedOperationIds: [],
    updatedAt: now,
  }
}

export function migrateV1Companies(
  companies: LegacyCompanyV1[],
  options: { now?: string; sourceKey?: string; backupKey?: string } = {},
): AppDataV2 {
  const now = options.now ?? new Date().toISOString()
  const legacyProfile = createLegacyV1Profile(now)
  const userCompanies: UserCompany[] = companies.map((company) => ({
    id: company.id,
    masterCompanyId: null,
    userEnteredName: company.name,
    role: company.role,
    applicationCategory: company.applicationCategory,
    manualPriority: company.priority,
    interest: Math.min(5, Math.max(0, company.interest)),
    applicationStatus: company.status,
    myPageStatus: company.myPageStatus,
    applicationUrl: safeApplicationUrl(company.applicationUrl),
    memo: company.memo,
    watchEnabled: true,
    events: company.events.map((event) => ({ ...event })),
    createdAt: company.createdAt,
    updatedAt: company.updatedAt,
  }))

  return {
    schemaVersion: 2,
    revision: 1,
    userCompanies,
    researchFacts: companies.flatMap((company) => legacyFacts(company, now)),
    scoringProfiles: [legacyProfile, createGeneralScoringProfile(now), createDeveloperReferenceProfile(now)],
    activeScoringProfileId: legacyProfile.id,
    evaluations: companies.map((company) => ({
      id: `evaluation_legacy_${company.id}`,
      userCompanyId: company.id,
      scoringProfileId: legacyProfile.id,
      values: {
        criterion_legacy_salary: company.scores.salary,
        criterion_legacy_benefits: company.scores.benefits,
        criterion_legacy_wlb: company.scores.wlb,
        criterion_legacy_remote: company.scores.remote,
        criterion_legacy_flex: company.scores.flex,
        criterion_legacy_overseas: company.scores.overseas,
        criterion_legacy_it_fit: company.scores.itFit,
        criterion_legacy_interest: company.interest,
      },
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    })),
    watchRuns: [],
    watchFindings: [],
    userSettings: { includePersonalNotesInAiExport: false, locale: 'ja-JP' },
    migrationHistory: [{
      id: createId('migration'),
      fromVersion: 1,
      toVersion: 2,
      migratedAt: now,
      sourceKey: options.sourceKey ?? V1_STORAGE_KEY,
      backupKey: options.backupKey ?? `${V1_BACKUP_PREFIX}${now}`,
      summary: `${companies.length}社を移行。ID、選考予定、メモ、時刻を保持。採用情報は未確認Factとして保存。`,
    }],
    aiImportHistory: [],
    processedOperationIds: [],
    updatedAt: now,
  }
}

