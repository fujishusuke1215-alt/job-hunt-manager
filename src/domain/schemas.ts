import { z } from 'zod'
import {
  applicationStatuses,
  closeReasons,
  eventStatuses,
  eventTypes,
  masterCompanyStatuses,
  myPageStatuses,
  priorities,
  offerDecisions,
  reviewStatuses,
  sourceTypes,
  selectionPhases,
  selectionStates,
  verificationLevels,
  watchFindingStatuses,
  watchFindingTypes,
  watchSeverities,
} from './types'

export function isSafeHttpUrl(value: string): boolean {
  if (!value) return true
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const nullableDateSchema = z.string().datetime().nullable()
const safeUrlSchema = z.string().refine(isSafeHttpUrl, 'URLはhttp/httpsだけ使用できます。')
const nullableSafeUrlSchema = z.string().nullable().refine(
  (value) => value === null || isSafeHttpUrl(value),
  'URLはhttp/httpsだけ使用できます。',
)

function duplicateIndexes<T>(
  items: readonly T[],
  valueOf: (item: T) => string,
): number[] {
  const seen = new Set<string>()
  const duplicates: number[] = []
  items.forEach((item, index) => {
    const value = valueOf(item)
    if (seen.has(value)) duplicates.push(index)
    else seen.add(value)
  })
  return duplicates
}

export const selectionEventSchema = z.object({
  id: z.string().min(1),
  type: z.enum(eventTypes),
  title: z.string(),
  scheduledAt: z.string(),
  status: z.enum(eventStatuses),
  location: z.string(),
  memo: z.string(),
}).strict()

export const masterCompanySchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  legalName: z.string().min(1),
  displayName: z.string().min(1),
  aliases: z.array(z.string()),
  formerNames: z.array(z.string()),
  officialDomains: z.array(z.string().min(1)),
  status: z.enum(masterCompanyStatuses),
  mergedIntoId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict()

export const catalogDataSchema = z.object({
  schemaVersion: z.literal(1),
  masterCompanies: z.array(masterCompanySchema),
  updatedAt: z.string().datetime(),
}).strict().superRefine((data, context) => {
  duplicateIndexes(data.masterCompanies, (company) => company.id).forEach((index) => {
    context.addIssue({
      code: 'custom',
      path: ['masterCompanies', index, 'id'],
      message: 'Company Master IDが重複しています。',
    })
  })
  duplicateIndexes(data.masterCompanies, (company) => company.slug).forEach((index) => {
    context.addIssue({
      code: 'custom',
      path: ['masterCompanies', index, 'slug'],
      message: 'Company Master slugが重複しています。',
    })
  })

  const masterById = new Map(data.masterCompanies.map((company) => [company.id, company]))
  data.masterCompanies.forEach((company, index) => {
    if (company.status === 'merged' && company.mergedIntoId === null) {
      context.addIssue({
        code: 'custom',
        path: ['masterCompanies', index, 'mergedIntoId'],
        message: 'mergedのCompany Masterには統合先IDが必要です。',
      })
      return
    }
    if (company.status !== 'merged' && company.mergedIntoId !== null) {
      context.addIssue({
        code: 'custom',
        path: ['masterCompanies', index, 'mergedIntoId'],
        message: 'merged以外のCompany Masterには統合先IDを設定できません。',
      })
      return
    }
    if (company.mergedIntoId !== null && !masterById.has(company.mergedIntoId)) {
      context.addIssue({
        code: 'custom',
        path: ['masterCompanies', index, 'mergedIntoId'],
        message: 'Company Masterの統合先がCatalogに存在しません。',
      })
    }
  })

  data.masterCompanies.forEach((company, index) => {
    const visited = new Set<string>()
    let current = company
    while (current.status === 'merged' && current.mergedIntoId !== null) {
      if (visited.has(current.id)) {
        context.addIssue({
          code: 'custom',
          path: ['masterCompanies', index, 'mergedIntoId'],
          message: 'Company Masterの統合先が循環しています。',
        })
        break
      }
      visited.add(current.id)
      const next = masterById.get(current.mergedIntoId)
      if (!next) break
      current = next
    }
  })
})

export const userCompanySchema = z.object({
  id: z.string().min(1),
  masterCompanyId: z.string().nullable(),
  userEnteredName: z.string().min(1),
  role: z.string(),
  applicationCategory: z.string(),
  manualPriority: z.enum(priorities),
  interest: z.number().min(0).max(5),
  applicationStatus: z.enum(applicationStatuses),
  myPageStatus: z.enum(myPageStatuses),
  applicationUrl: safeUrlSchema,
  selectionPhase: z.enum(selectionPhases).optional().default('considering'),
  selectionState: z.enum(selectionStates).optional().default('active'),
  closeReason: z.enum(closeReasons).nullable().optional().default(null),
  offerDecision: z.enum(offerDecisions).nullable().optional().default(null),
  selectionStageUpdatedAt: z.string().datetime().optional().default(() => new Date(0).toISOString()),
  lastCompanyInteractionAt: z.string().datetime().nullable().optional().default(null),
  memo: z.string(),
  watchEnabled: z.boolean(),
  events: z.array(selectionEventSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict()

export const researchSourceSchema = z.object({
  id: z.string().min(1),
  type: z.enum(sourceTypes),
  title: z.string(),
  url: nullableSafeUrlSchema,
  retrievedAt: nullableDateSchema,
  publishedAt: nullableDateSchema,
  note: z.string(),
}).strict()

export const researchFactSchema = z.object({
  id: z.string().min(1),
  userCompanyId: z.string().nullable(),
  masterCompanyId: z.string().nullable(),
  key: z.string().min(1),
  label: z.string().min(1),
  value: z.string(),
  recruitingCycle: z.string().nullable(),
  roleScope: z.string().nullable(),
  checkedAt: nullableDateSchema,
  verificationLevel: z.enum(verificationLevels),
  reviewStatus: z.enum(reviewStatuses),
  processedByAi: z.boolean(),
  sources: z.array(researchSourceSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict()

export const criterionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
  scaleMax: z.number().positive(),
  weight: z.number().nonnegative(),
  enabled: z.boolean(),
  order: z.number().int().nonnegative(),
}).strict()

export const scoringProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  criteria: z.array(criterionSchema),
  kind: z.enum(['built_in', 'custom', 'legacy']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict()

export const companyEvaluationSchema = z.object({
  id: z.string().min(1),
  userCompanyId: z.string().min(1),
  scoringProfileId: z.string().min(1),
  values: z.record(z.string(), z.number().finite().nullable()),
  sourceName: z.string().min(1).optional(),
  sourceAsOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sourceFingerprint: z.string().min(1).optional(),
  sourceRank: z.number().int().positive().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict()

export const watchRunSchema = z.object({
  id: z.string().min(1),
  provider: z.string(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  findingCount: z.number().int().nonnegative(),
  status: z.enum(['completed', 'failed']),
  note: z.string(),
}).strict()

export const watchFindingSchema = z.object({
  id: z.string().min(1),
  userCompanyId: z.string().min(1),
  masterCompanyId: z.string().nullable(),
  watchRunId: z.string().nullable(),
  type: z.enum(watchFindingTypes),
  severity: z.enum(watchSeverities),
  title: z.string().min(1),
  summary: z.string(),
  detectedAt: z.string().datetime(),
  deadline: nullableDateSchema,
  source: researchSourceSchema.nullable(),
  status: z.enum(watchFindingStatuses),
  fingerprint: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict()

export const appDataV2Schema = z.object({
  schemaVersion: z.literal(2),
  revision: z.number().int().nonnegative(),
  userCompanies: z.array(userCompanySchema),
  researchFacts: z.array(researchFactSchema),
  scoringProfiles: z.array(scoringProfileSchema).min(1),
  activeScoringProfileId: z.string().min(1),
  evaluations: z.array(companyEvaluationSchema),
  watchRuns: z.array(watchRunSchema),
  watchFindings: z.array(watchFindingSchema),
  userSettings: z.object({
    includePersonalNotesInAiExport: z.boolean(),
    locale: z.literal('ja-JP'),
    graduationYear: z.number().int().min(1900).max(3000).nullable().optional().default(null),
    lastUserActiveAt: z.string().datetime().nullable().optional().default(null),
  }).strict(),
  migrationHistory: z.array(z.object({
    id: z.string().min(1),
    fromVersion: z.number().int(),
    toVersion: z.number().int(),
    migratedAt: z.string().datetime(),
    sourceKey: z.string(),
    backupKey: z.string(),
    summary: z.string(),
  }).strict()),
  aiImportHistory: z.array(z.object({
    id: z.string().min(1),
    provider: z.string(),
    envelopeGeneratedAt: z.string().datetime(),
    importedAt: z.string().datetime(),
    appliedOperationIds: z.array(z.string().min(1)),
    skippedOperationIds: z.array(z.string().min(1)),
  }).strict()),
  processedOperationIds: z.array(z.string().min(1)),
  updatedAt: z.string().datetime(),
}).strict().superRefine((data, context) => {
  const reportDuplicateIds = (
    items: readonly { id: string }[],
    path: string,
    label: string,
  ) => {
    duplicateIndexes(items, (item) => item.id).forEach((index) => {
      context.addIssue({
        code: 'custom',
        path: [path, index, 'id'],
        message: `${label} IDが重複しています。`,
      })
    })
  }

  reportDuplicateIds(data.userCompanies, 'userCompanies', 'User Company')
  reportDuplicateIds(data.researchFacts, 'researchFacts', 'Research Fact')
  reportDuplicateIds(data.scoringProfiles, 'scoringProfiles', 'Scoring Profile')
  reportDuplicateIds(data.evaluations, 'evaluations', 'Company Evaluation')
  reportDuplicateIds(data.watchRuns, 'watchRuns', 'Watch Run')
  reportDuplicateIds(data.watchFindings, 'watchFindings', 'Watch Finding')
  reportDuplicateIds(data.migrationHistory, 'migrationHistory', 'Migration History')
  reportDuplicateIds(data.aiImportHistory, 'aiImportHistory', 'AI Import History')

  if (!data.scoringProfiles.some((profile) => profile.id === data.activeScoringProfileId)) {
    context.addIssue({ code: 'custom', path: ['activeScoringProfileId'], message: '有効な評価プロファイルがありません。' })
  }

  const userCompanyIds = new Set(data.userCompanies.map((company) => company.id))
  const scoringProfileById = new Map(data.scoringProfiles.map((profile) => [profile.id, profile]))
  const watchRunIds = new Set(data.watchRuns.map((run) => run.id))

  data.userCompanies.forEach((company, companyIndex) => {
    duplicateIndexes(company.events, (event) => event.id).forEach((eventIndex) => {
      context.addIssue({
        code: 'custom',
        path: ['userCompanies', companyIndex, 'events', eventIndex, 'id'],
        message: '同じ企業内でSelection Event IDが重複しています。',
      })
    })
  })

  const criterionOwner = new Map<string, { profileIndex: number; criterionIndex: number }>()
  data.scoringProfiles.forEach((profile, profileIndex) => {
    duplicateIndexes(profile.criteria, (criterion) => String(criterion.order)).forEach((criterionIndex) => {
      context.addIssue({
        code: 'custom',
        path: ['scoringProfiles', profileIndex, 'criteria', criterionIndex, 'order'],
        message: '同じ評価プロファイル内でCriterionの表示順が重複しています。',
      })
    })
    profile.criteria.forEach((criterion, criterionIndex) => {
      if (criterionOwner.has(criterion.id)) {
        context.addIssue({
          code: 'custom',
          path: ['scoringProfiles', profileIndex, 'criteria', criterionIndex, 'id'],
          message: 'Criterion IDが評価プロファイル間で重複しています。',
        })
      } else {
        criterionOwner.set(criterion.id, { profileIndex, criterionIndex })
      }
    })
  })

  data.researchFacts.forEach((fact, factIndex) => {
    if (fact.userCompanyId === null && fact.masterCompanyId === null) {
      context.addIssue({
        code: 'custom',
        path: ['researchFacts', factIndex, 'userCompanyId'],
        message: 'Research FactにはUser CompanyまたはCompany Masterの参照が必要です。',
      })
    }
    if (fact.userCompanyId !== null && !userCompanyIds.has(fact.userCompanyId)) {
      context.addIssue({
        code: 'custom',
        path: ['researchFacts', factIndex, 'userCompanyId'],
        message: 'Research FactのUser Company参照先が存在しません。',
      })
    }
    duplicateIndexes(fact.sources, (source) => source.id).forEach((sourceIndex) => {
      context.addIssue({
        code: 'custom',
        path: ['researchFacts', factIndex, 'sources', sourceIndex, 'id'],
        message: '同じResearch Fact内でSource IDが重複しています。',
      })
    })
  })

  const evaluationPairs = new Map<string, number>()
  data.evaluations.forEach((evaluation, evaluationIndex) => {
    if (!userCompanyIds.has(evaluation.userCompanyId)) {
      context.addIssue({
        code: 'custom',
        path: ['evaluations', evaluationIndex, 'userCompanyId'],
        message: 'Company EvaluationのUser Company参照先が存在しません。',
      })
    }
    const profile = scoringProfileById.get(evaluation.scoringProfileId)
    if (!profile) {
      context.addIssue({
        code: 'custom',
        path: ['evaluations', evaluationIndex, 'scoringProfileId'],
        message: 'Company EvaluationのScoring Profile参照先が存在しません。',
      })
    } else {
      const criterionById = new Map(profile.criteria.map((criterion) => [criterion.id, criterion]))
      Object.entries(evaluation.values).forEach(([criterionId, score]) => {
        const criterion = criterionById.get(criterionId)
        if (!criterion) {
          context.addIssue({
            code: 'custom',
            path: ['evaluations', evaluationIndex, 'values', criterionId],
            message: '評価値が参照するCriterion IDがプロファイルに存在しません。',
          })
        } else if (score !== null && (score < 0 || score > criterion.scaleMax)) {
          context.addIssue({
            code: 'custom',
            path: ['evaluations', evaluationIndex, 'values', criterionId],
            message: `評価値は0以上${criterion.scaleMax}以下にしてください。`,
          })
        }
      })
    }

    const pair = `${evaluation.userCompanyId}\u0000${evaluation.scoringProfileId}`
    if (evaluationPairs.has(pair)) {
      context.addIssue({
        code: 'custom',
        path: ['evaluations', evaluationIndex],
        message: '同じ企業と評価プロファイルのCompany Evaluationが重複しています。',
      })
    } else {
      evaluationPairs.set(pair, evaluationIndex)
    }
  })

  const findingFingerprints = new Set<string>()
  data.watchFindings.forEach((finding, findingIndex) => {
    if (!userCompanyIds.has(finding.userCompanyId)) {
      context.addIssue({
        code: 'custom',
        path: ['watchFindings', findingIndex, 'userCompanyId'],
        message: 'Watch FindingのUser Company参照先が存在しません。',
      })
    }
    if (finding.watchRunId !== null && !watchRunIds.has(finding.watchRunId)) {
      context.addIssue({
        code: 'custom',
        path: ['watchFindings', findingIndex, 'watchRunId'],
        message: 'Watch FindingのWatch Run参照先が存在しません。',
      })
    }
    const fingerprint = `${finding.userCompanyId}\u0000${finding.fingerprint}`
    if (findingFingerprints.has(fingerprint)) {
      context.addIssue({
        code: 'custom',
        path: ['watchFindings', findingIndex, 'fingerprint'],
        message: '同じ企業のWatch Finding fingerprintが重複しています。',
      })
    } else {
      findingFingerprints.add(fingerprint)
    }
  })

  duplicateIndexes(data.processedOperationIds, (operationId) => operationId).forEach((index) => {
    context.addIssue({
      code: 'custom',
      path: ['processedOperationIds', index],
      message: '処理済みoperationIdが重複しています。',
    })
  })
  const processedOperationIds = new Set(data.processedOperationIds)
  data.aiImportHistory.forEach((history, historyIndex) => {
    duplicateIndexes(history.appliedOperationIds, (operationId) => operationId).forEach((index) => {
      context.addIssue({
        code: 'custom',
        path: ['aiImportHistory', historyIndex, 'appliedOperationIds', index],
        message: '反映済みoperationIdが履歴内で重複しています。',
      })
    })
    duplicateIndexes(history.skippedOperationIds, (operationId) => operationId).forEach((index) => {
      context.addIssue({
        code: 'custom',
        path: ['aiImportHistory', historyIndex, 'skippedOperationIds', index],
        message: '未反映operationIdが履歴内で重複しています。',
      })
    })
    const skipped = new Set(history.skippedOperationIds)
    history.appliedOperationIds.forEach((operationId, operationIndex) => {
      if (skipped.has(operationId)) {
        context.addIssue({
          code: 'custom',
          path: ['aiImportHistory', historyIndex, 'appliedOperationIds', operationIndex],
          message: '同じoperationIdを反映済みと未反映の両方へ記録できません。',
        })
      }
      if (!processedOperationIds.has(operationId)) {
        context.addIssue({
          code: 'custom',
          path: ['aiImportHistory', historyIndex, 'appliedOperationIds', operationIndex],
          message: '反映済みoperationIdが処理済み一覧に存在しません。',
        })
      }
    })
  })
})

export function parseAppDataV2(input: unknown) {
  return appDataV2Schema.parse(input)
}

export function safeParseAppDataV2(input: unknown) {
  return appDataV2Schema.safeParse(input)
}
