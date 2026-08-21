import { z } from 'zod'
import {
  applicationStatuses,
  eventStatuses,
  eventTypes,
  masterCompanyStatuses,
  myPageStatuses,
  priorities,
  reviewStatuses,
  sourceTypes,
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
}).strict()

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
  order: z.number().int(),
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
    appliedOperationIds: z.array(z.string()),
    skippedOperationIds: z.array(z.string()),
  }).strict()),
  processedOperationIds: z.array(z.string()),
  updatedAt: z.string().datetime(),
}).strict().superRefine((data, context) => {
  if (!data.scoringProfiles.some((profile) => profile.id === data.activeScoringProfileId)) {
    context.addIssue({ code: 'custom', path: ['activeScoringProfileId'], message: '有効な評価プロファイルがありません。' })
  }
})

export function parseAppDataV2(input: unknown) {
  return appDataV2Schema.parse(input)
}

export function safeParseAppDataV2(input: unknown) {
  return appDataV2Schema.safeParse(input)
}

