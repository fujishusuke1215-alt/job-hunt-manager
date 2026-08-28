import { describe, expect, it } from 'vitest'
import { demoCatalog } from '../data/catalogData'
import { createDemoCompanies } from '../data/demoData'
import { createDemoAppData } from '../data/demoDataV2'
import { createImportPreview } from '../repositories/types'
import { createEmptyAppData, migrateV1Companies } from './migration'
import { catalogDataSchema, parseAppDataV2, safeParseAppDataV2 } from './schemas'
import type { AppDataV2 } from './types'

const NOW = '2026-08-21T00:00:00.000Z'

function richAppData(): AppDataV2 {
  const data = createEmptyAppData(NOW)
  const profile = data.scoringProfiles[0]
  const firstCriterion = profile.criteria[0]
  data.userCompanies = [{
    id: 'company_schema_1',
    masterCompanyId: 'cmp_demo_sample_tech_01',
    userEnteredName: '架空スキーマ株式会社',
    role: '開発職',
    applicationCategory: '新卒',
    manualPriority: 'A',
    interest: 4,
    applicationStatus: '面接待ち',
    myPageStatus: '開設済み',
    applicationUrl: 'https://schema.example.test/apply',
    memo: '',
    watchEnabled: true,
    events: [{
      id: 'event_schema_1',
      type: '面接',
      title: '架空面接',
      scheduledAt: '2026-08-22T10:00',
      status: '予定',
      location: 'オンライン',
      memo: '',
    }],
    createdAt: NOW,
    updatedAt: NOW,
  }]
  data.researchFacts = [{
    id: 'fact_schema_1',
    userCompanyId: 'company_schema_1',
    masterCompanyId: 'cmp_demo_sample_tech_01',
    key: 'eligibility',
    label: '応募資格',
    value: '応募可',
    recruitingCycle: '架空28卒',
    roleScope: '開発職',
    checkedAt: NOW,
    verificationLevel: 'official_confirmed',
    reviewStatus: 'confirmed',
    processedByAi: false,
    sources: [{
      id: 'source_schema_1',
      type: 'official_web',
      title: '架空の公式ページ',
      url: 'https://schema.example.test/recruit',
      retrievedAt: NOW,
      publishedAt: null,
      note: '',
    }],
    createdAt: NOW,
    updatedAt: NOW,
  }]
  data.evaluations = [{
    id: 'evaluation_schema_1',
    userCompanyId: 'company_schema_1',
    scoringProfileId: profile.id,
    values: {
      [firstCriterion.id]: firstCriterion.scaleMax,
      [profile.criteria[1].id]: null,
    },
    createdAt: NOW,
    updatedAt: NOW,
  }]
  data.watchRuns = [{
    id: 'watch_run_schema_1',
    provider: 'manual-ai-test',
    startedAt: NOW,
    completedAt: NOW,
    findingCount: 1,
    status: 'completed',
    note: '',
  }]
  data.watchFindings = [{
    id: 'finding_schema_1',
    userCompanyId: 'company_schema_1',
    masterCompanyId: 'cmp_demo_sample_tech_01',
    watchRunId: 'watch_run_schema_1',
    type: 'application_deadline',
    severity: 'high',
    title: '架空応募締切',
    summary: 'スキーマ検証用の架空情報',
    detectedAt: NOW,
    deadline: '2026-08-25T00:00:00.000Z',
    source: null,
    status: 'new',
    fingerprint: 'schema-fingerprint-1',
    createdAt: NOW,
    updatedAt: NOW,
  }]
  data.processedOperationIds = ['operation_schema_1']
  data.aiImportHistory = [{
    id: 'history_schema_1',
    provider: 'manual-ai-test',
    envelopeGeneratedAt: NOW,
    importedAt: NOW,
    appliedOperationIds: ['operation_schema_1'],
    skippedOperationIds: ['operation_schema_skipped'],
  }]
  return data
}

function invalidIssuePaths(data: AppDataV2): string[] {
  const result = safeParseAppDataV2(data)
  expect(result.success).toBe(false)
  if (result.success) return []
  return result.error.issues.map((issue) => issue.path.join('.'))
}

describe('AppDataV2 runtime integrity', () => {
  it('空状態・v1移行結果・公開デモの正当データを受け付ける', () => {
    const migrated = migrateV1Companies(createDemoCompanies().slice(0, 1), { now: NOW })

    expect(safeParseAppDataV2(createEmptyAppData(NOW)).success).toBe(true)
    expect(safeParseAppDataV2(migrated).success).toBe(true)
    expect(safeParseAppDataV2(createDemoAppData()).success).toBe(true)
  })

  it('top-level entity IDと埋め込みIDの重複を拒否する', () => {
    const duplicateCompany = structuredClone(richAppData())
    duplicateCompany.userCompanies.push({
      ...structuredClone(duplicateCompany.userCompanies[0]),
      events: [],
    })
    expect(invalidIssuePaths(duplicateCompany)).toContain('userCompanies.1.id')

    const duplicateEvent = structuredClone(richAppData())
    duplicateEvent.userCompanies[0].events.push({ ...duplicateEvent.userCompanies[0].events[0] })
    expect(invalidIssuePaths(duplicateEvent)).toContain('userCompanies.0.events.1.id')

    const duplicateFactSource = structuredClone(richAppData())
    duplicateFactSource.researchFacts[0].sources.push({ ...duplicateFactSource.researchFacts[0].sources[0] })
    expect(invalidIssuePaths(duplicateFactSource)).toContain('researchFacts.0.sources.1.id')

    const duplicateCriterion = structuredClone(richAppData())
    duplicateCriterion.scoringProfiles[0].criteria[1].id = duplicateCriterion.scoringProfiles[0].criteria[0].id
    expect(invalidIssuePaths(duplicateCriterion)).toContain('scoringProfiles.0.criteria.1.id')
  })

  it('存在しないactive profileと内部参照先を拒否する', () => {
    const missingActive = structuredClone(richAppData())
    missingActive.activeScoringProfileId = 'missing_profile'
    expect(invalidIssuePaths(missingActive)).toContain('activeScoringProfileId')

    const orphanFact = structuredClone(richAppData())
    orphanFact.researchFacts[0].userCompanyId = 'missing_company'
    expect(invalidIssuePaths(orphanFact)).toContain('researchFacts.0.userCompanyId')

    const ownerlessFact = structuredClone(richAppData())
    ownerlessFact.researchFacts[0].userCompanyId = null
    ownerlessFact.researchFacts[0].masterCompanyId = null
    expect(invalidIssuePaths(ownerlessFact)).toContain('researchFacts.0.userCompanyId')

    const orphanEvaluationCompany = structuredClone(richAppData())
    orphanEvaluationCompany.evaluations[0].userCompanyId = 'missing_company'
    expect(invalidIssuePaths(orphanEvaluationCompany)).toContain('evaluations.0.userCompanyId')

    const orphanEvaluationProfile = structuredClone(richAppData())
    orphanEvaluationProfile.evaluations[0].scoringProfileId = 'missing_profile'
    expect(invalidIssuePaths(orphanEvaluationProfile)).toContain('evaluations.0.scoringProfileId')

    const orphanFindingCompany = structuredClone(richAppData())
    orphanFindingCompany.watchFindings[0].userCompanyId = 'missing_company'
    expect(invalidIssuePaths(orphanFindingCompany)).toContain('watchFindings.0.userCompanyId')

    const orphanWatchRun = structuredClone(richAppData())
    orphanWatchRun.watchFindings[0].watchRunId = 'missing_run'
    expect(invalidIssuePaths(orphanWatchRun)).toContain('watchFindings.0.watchRunId')
  })

  it('EvaluationのCriterion参照・score範囲・企業profile組の一意性を検証する', () => {
    const profile = richAppData().scoringProfiles[0]
    const criterion = profile.criteria[0]

    const unknownCriterion = structuredClone(richAppData())
    unknownCriterion.evaluations[0].values.unknown_criterion = 1
    expect(invalidIssuePaths(unknownCriterion)).toContain('evaluations.0.values.unknown_criterion')

    const negativeScore = structuredClone(richAppData())
    negativeScore.evaluations[0].values[criterion.id] = -0.1
    expect(invalidIssuePaths(negativeScore)).toContain(`evaluations.0.values.${criterion.id}`)

    const overMaxScore = structuredClone(richAppData())
    overMaxScore.evaluations[0].values[criterion.id] = criterion.scaleMax + 0.1
    expect(invalidIssuePaths(overMaxScore)).toContain(`evaluations.0.values.${criterion.id}`)

    const duplicatePair = structuredClone(richAppData())
    duplicatePair.evaluations.push({ ...structuredClone(duplicatePair.evaluations[0]), id: 'evaluation_schema_2' })
    expect(invalidIssuePaths(duplicatePair)).toContain('evaluations.1')
  })

  it('Watch fingerprintとAI operation履歴の矛盾を拒否する', () => {
    const duplicateFingerprint = structuredClone(richAppData())
    duplicateFingerprint.watchFindings.push({
      ...structuredClone(duplicateFingerprint.watchFindings[0]),
      id: 'finding_schema_2',
    })
    expect(invalidIssuePaths(duplicateFingerprint)).toContain('watchFindings.1.fingerprint')

    const duplicateProcessed = structuredClone(richAppData())
    duplicateProcessed.processedOperationIds.push('operation_schema_1')
    expect(invalidIssuePaths(duplicateProcessed)).toContain('processedOperationIds.1')

    const missingProcessed = structuredClone(richAppData())
    missingProcessed.processedOperationIds = []
    expect(invalidIssuePaths(missingProcessed)).toContain('aiImportHistory.0.appliedOperationIds.0')

    const appliedAndSkipped = structuredClone(richAppData())
    appliedAndSkipped.aiImportHistory[0].skippedOperationIds.push('operation_schema_1')
    expect(invalidIssuePaths(appliedAndSkipped)).toContain('aiImportHistory.0.appliedOperationIds.0')
  })

  it('整合性違反のv2 importをpreview前に拒否し、現在データを変更しない', () => {
    const current = richAppData()
    const before = structuredClone(current)
    const invalid = structuredClone(current)
    invalid.evaluations[0].userCompanyId = 'missing_company'

    expect(() => createImportPreview(JSON.stringify(invalid), NOW)).toThrow('現在のデータは変更していません')
    expect(current).toEqual(before)
  })

  it('legacy source datetimeを読み込み境界でcanonical ISOへ正規化する', () => {
    const legacy = richAppData()
    legacy.watchFindings[0].source = {
      id: 'source_legacy', type: 'email', title: 'legacy', url: null,
      retrievedAt: '2026-08-26 12:34:13+00',
      publishedAt: '2026-08-26 12:34:13+00', note: '',
    }
    const parsed = parseAppDataV2(legacy)
    expect(parsed.watchFindings[0].source?.publishedAt).toBe('2026-08-26T12:34:13.000Z')
    expect(parsed.watchFindings[0].source?.retrievedAt).toBe('2026-08-26T12:34:13.000Z')
  })

  it('collector eventのPostgreSQL timestamptzをcanonical ISOへ正規化する', () => {
    const legacy = richAppData()
    legacy.userCompanies[0].events[0] = {
      ...legacy.userCompanies[0].events[0],
      dueAt: '2026-09-01 09:00:00+00',
      startsAt: '2026-09-03 05:00:00+00',
      endsAt: '2026-09-03 06:00:00+00',
    }

    const parsed = parseAppDataV2(legacy)
    expect(parsed.userCompanies[0].events[0].dueAt).toBe('2026-09-01T09:00:00.000Z')
    expect(parsed.userCompanies[0].events[0].startsAt).toBe('2026-09-03T05:00:00.000Z')
    expect(parsed.userCompanies[0].events[0].endsAt).toBe('2026-09-03T06:00:00.000Z')
  })

  it('invalid optional legacy source datetime is isolated as null', () => {
    const legacy = richAppData()
    legacy.watchFindings[0].source = {
      id: 'source_invalid', type: 'email', title: 'legacy', url: null,
      retrievedAt: 'not a date', publishedAt: 'timezone unknown', note: '',
    }
    const parsed = parseAppDataV2(legacy)
    expect(parsed.watchFindings[0].source?.publishedAt).toBeNull()
    expect(parsed.watchFindings[0].source?.retrievedAt).toBeNull()
  })
})

describe('Catalog runtime integrity', () => {
  it('架空の正当Catalogを受け付ける', () => {
    expect(catalogDataSchema.safeParse(demoCatalog).success).toBe(true)
  })

  it('Master ID/slug重複と不正なmerged参照を拒否する', () => {
    const duplicate = structuredClone(demoCatalog)
    duplicate.masterCompanies[1].id = duplicate.masterCompanies[0].id
    duplicate.masterCompanies[1].slug = duplicate.masterCompanies[0].slug
    const duplicateResult = catalogDataSchema.safeParse(duplicate)
    expect(duplicateResult.success).toBe(false)
    if (!duplicateResult.success) {
      const paths = duplicateResult.error.issues.map((issue) => issue.path.join('.'))
      expect(paths).toContain('masterCompanies.1.id')
      expect(paths).toContain('masterCompanies.1.slug')
    }

    const missingTarget = structuredClone(demoCatalog)
    const merged = missingTarget.masterCompanies.find((company) => company.status === 'merged')!
    merged.mergedIntoId = 'cmp_missing'
    expect(catalogDataSchema.safeParse(missingTarget).success).toBe(false)

    const mergedWithoutTarget = structuredClone(demoCatalog)
    mergedWithoutTarget.masterCompanies.find((company) => company.status === 'merged')!.mergedIntoId = null
    expect(catalogDataSchema.safeParse(mergedWithoutTarget).success).toBe(false)

    const activeWithTarget = structuredClone(demoCatalog)
    activeWithTarget.masterCompanies[0].mergedIntoId = activeWithTarget.masterCompanies[1].id
    expect(catalogDataSchema.safeParse(activeWithTarget).success).toBe(false)
  })

  it('mergedIntoIdの循環を拒否する', () => {
    const cyclic = structuredClone(demoCatalog)
    cyclic.masterCompanies[0].status = 'merged'
    cyclic.masterCompanies[0].mergedIntoId = cyclic.masterCompanies[1].id
    cyclic.masterCompanies[1].status = 'merged'
    cyclic.masterCompanies[1].mergedIntoId = cyclic.masterCompanies[0].id

    const result = catalogDataSchema.safeParse(cyclic)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes('循環'))).toBe(true)
    }
  })
})
