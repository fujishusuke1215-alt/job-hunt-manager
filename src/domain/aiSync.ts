import { z } from 'zod'
import { isSafeHttpUrl } from './schemas'
import {
  applicationStatuses,
  eventStatuses,
  eventTypes,
  myPageStatuses,
  priorities,
  reviewStatuses,
  verificationLevels,
  watchFindingStatuses,
  watchFindingTypes,
  watchSeverities,
  type AppDataV2,
  type CatalogData,
  type MasterCompany,
  type ResearchSource,
  type ScoringProfile,
  type UserCompany,
} from './types'
import { upsertWatchFinding } from './watch'

const dateTimeSchema = z.string().datetime()
const nullableDateTimeSchema = dateTimeSchema.nullable()
const safeUrlSchema = z.string().refine(isSafeHttpUrl, 'URLはhttp/httpsだけ使用できます。')
const nullableSafeUrlSchema = z
  .string()
  .nullable()
  .refine((value) => value === null || isSafeHttpUrl(value), 'URLはhttp/httpsだけ使用できます。')

export const aiCompanyRefSchema = z
  .object({
    masterCompanyId: z.string().min(1).optional(),
    companyName: z.string().min(1).optional(),
    officialDomain: z.string().min(1).optional(),
  })
  .strict()
  .refine(
    (reference) =>
      Boolean(reference.masterCompanyId || reference.companyName || reference.officialDomain),
    'companyRefにはmasterCompanyId、companyName、officialDomainのいずれかが必要です。',
  )

export const aiEvidenceSchema = z
  .object({
    id: z.string().min(1).optional(),
    type: z.enum([
      'official_web',
      'email',
      'third_party_web',
      'user',
      'ai_summary',
      'legacy',
    ]),
    title: z.string(),
    url: nullableSafeUrlSchema.default(null),
    retrievedAt: nullableDateTimeSchema.default(null),
    publishedAt: nullableDateTimeSchema.default(null),
    note: z.string().default(''),
  })
  .strict()

const researchFactPayloadSchema = z
  .object({
    id: z.string().min(1).optional(),
    key: z.string().min(1),
    label: z.string().min(1),
    value: z.string(),
    recruitingCycle: z.string().nullable().default(null),
    roleScope: z.string().nullable().default(null),
    checkedAt: nullableDateTimeSchema.default(null),
    verificationLevel: z.enum(verificationLevels),
    reviewStatus: z.enum(reviewStatuses).default('draft'),
    processedByAi: z.boolean().default(true),
  })
  .strict()

const selectionEventPayloadSchema = z
  .object({
    id: z.string().min(1).optional(),
    type: z.enum(eventTypes),
    title: z.string(),
    scheduledAt: z.string().min(1),
    status: z.enum(eventStatuses).default('予定'),
    location: z.string().default(''),
    memo: z.string().default(''),
  })
  .strict()

const watchFindingPayloadSchema = z
  .object({
    id: z.string().min(1).optional(),
    watchRunId: z.string().nullable().default(null),
    type: z.enum(watchFindingTypes),
    severity: z.enum(watchSeverities),
    title: z.string().min(1),
    summary: z.string(),
    detectedAt: dateTimeSchema,
    deadline: nullableDateTimeSchema.default(null),
    status: z.enum(watchFindingStatuses).default('new'),
    fingerprint: z.string().min(1),
  })
  .strict()

const userCompanyPayloadSchema = z
  .object({
    id: z.string().min(1).optional(),
    userEnteredName: z.string().min(1).optional(),
    role: z.string().optional(),
    applicationCategory: z.string().optional(),
    manualPriority: z.enum(priorities).optional(),
    interest: z.number().min(0).max(5).optional(),
    applicationStatus: z.enum(applicationStatuses).optional(),
    myPageStatus: z.enum(myPageStatuses).optional(),
    applicationUrl: safeUrlSchema.optional(),
    memo: z.string().optional(),
    watchEnabled: z.boolean().optional(),
  })
  .strict()

const scoringProfilePayloadSchema = z
  .object({
    id: z.string().min(1).optional(),
    name: z.string().min(1),
    kind: z.enum(['built_in', 'custom', 'legacy']).default('custom'),
    criteria: z.array(
      z
        .object({
          id: z.string().min(1),
          label: z.string().min(1),
          description: z.string(),
          scaleMax: z.number().positive(),
          weight: z.number().nonnegative(),
          enabled: z.boolean(),
          order: z.number().int(),
        })
        .strict(),
    ),
  })
  .strict()

const deletePayloadSchema = z.object({ id: z.string().min(1) }).strict()
const evidenceField = { evidence: z.array(aiEvidenceSchema).default([]) }
const companyOperationFields = {
  operationId: z.string().min(1),
  companyRef: aiCompanyRefSchema,
  ...evidenceField,
}
const profileOperationFields = {
  operationId: z.string().min(1),
  companyRef: aiCompanyRefSchema.optional(),
  ...evidenceField,
}

const researchFactUpsertOperationSchema = z
  .object({
    ...companyOperationFields,
    entityType: z.literal('researchFact'),
    action: z.literal('upsert'),
    payload: researchFactPayloadSchema,
  })
  .strict()
const researchFactDeleteOperationSchema = z
  .object({
    ...companyOperationFields,
    entityType: z.literal('researchFact'),
    action: z.literal('delete'),
    payload: deletePayloadSchema,
  })
  .strict()
const selectionEventUpsertOperationSchema = z
  .object({
    ...companyOperationFields,
    entityType: z.literal('selectionEvent'),
    action: z.literal('upsert'),
    payload: selectionEventPayloadSchema,
  })
  .strict()
const selectionEventDeleteOperationSchema = z
  .object({
    ...companyOperationFields,
    entityType: z.literal('selectionEvent'),
    action: z.literal('delete'),
    payload: deletePayloadSchema,
  })
  .strict()
const watchFindingUpsertOperationSchema = z
  .object({
    ...companyOperationFields,
    entityType: z.literal('watchFinding'),
    action: z.literal('upsert'),
    payload: watchFindingPayloadSchema,
  })
  .strict()
const watchFindingDeleteOperationSchema = z
  .object({
    ...companyOperationFields,
    entityType: z.literal('watchFinding'),
    action: z.literal('delete'),
    payload: deletePayloadSchema,
  })
  .strict()
const userCompanyUpsertOperationSchema = z
  .object({
    ...companyOperationFields,
    entityType: z.literal('userCompany'),
    action: z.literal('upsert'),
    payload: userCompanyPayloadSchema,
  })
  .strict()
const userCompanyDeleteOperationSchema = z
  .object({
    ...companyOperationFields,
    entityType: z.literal('userCompany'),
    action: z.literal('delete'),
    payload: deletePayloadSchema,
  })
  .strict()
const scoringProfileUpsertOperationSchema = z
  .object({
    ...profileOperationFields,
    entityType: z.literal('scoringProfile'),
    action: z.literal('upsert'),
    payload: scoringProfilePayloadSchema,
  })
  .strict()
const scoringProfileDeleteOperationSchema = z
  .object({
    ...profileOperationFields,
    entityType: z.literal('scoringProfile'),
    action: z.literal('delete'),
    payload: deletePayloadSchema,
  })
  .strict()

export const aiSyncOperationSchema = z.union([
  researchFactUpsertOperationSchema,
  researchFactDeleteOperationSchema,
  selectionEventUpsertOperationSchema,
  selectionEventDeleteOperationSchema,
  watchFindingUpsertOperationSchema,
  watchFindingDeleteOperationSchema,
  userCompanyUpsertOperationSchema,
  userCompanyDeleteOperationSchema,
  scoringProfileUpsertOperationSchema,
  scoringProfileDeleteOperationSchema,
])

export const aiSyncEnvelopeV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: dateTimeSchema,
    provider: z.string().min(1),
    operations: z.array(aiSyncOperationSchema),
  })
  .strict()

export type AiCompanyRef = z.infer<typeof aiCompanyRefSchema>
export type AiEvidence = z.infer<typeof aiEvidenceSchema>
export type AiSyncOperation = z.infer<typeof aiSyncOperationSchema>
export type AiSyncEnvelopeV1 = z.infer<typeof aiSyncEnvelopeV1Schema>
export type AiSyncEntityType = AiSyncOperation['entityType']

export type AiSyncMatchStatus =
  | 'matched'
  | 'master_only'
  | 'new_custom'
  | 'not_required'
  | 'not_found'
  | 'ambiguous'

export interface AiSyncCompanyMatch {
  status: AiSyncMatchStatus
  matchedUserCompanyId: string | null
  matchedMasterCompanyId: string | null
  candidateUserCompanyIds: string[]
  candidateMasterCompanyIds: string[]
  message: string
}

export interface AiSyncChange {
  field: string
  label: string
  before: unknown
  after: unknown
}

export type AiSyncPreviewStatus = 'ready' | 'duplicate' | 'blocked'

export interface AiSyncPreviewItem {
  operation: AiSyncOperation
  status: AiSyncPreviewStatus
  canApply: boolean
  requiresDeleteConfirmation: boolean
  companyMatch: AiSyncCompanyMatch
  targetEntityId: string | null
  targetLabel: string
  changes: AiSyncChange[]
  message: string
}

export interface AiSyncPreview {
  envelope: AiSyncEnvelopeV1
  baseRevision: number
  items: AiSyncPreviewItem[]
  readyCount: number
  blockedCount: number
  duplicateCount: number
}

export interface AiSyncCommitOptions {
  now?: string
  confirmedDeleteOperationIds?: Iterable<string>
}

export interface AiSyncCommitResult {
  data: AppDataV2
  appliedOperationIds: string[]
  skippedOperationIds: string[]
  deleteConfirmationRequiredIds: string[]
}

export class AiSyncValidationError extends Error {
  readonly issues: string[]

  constructor(message: string, issues: string[] = []) {
    super(message)
    this.name = 'AiSyncValidationError'
    this.issues = issues
  }
}

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'root'
    return `${path}: ${issue.message}`
  })
}

export function parseAiSyncEnvelope(input: string | unknown): AiSyncEnvelopeV1 {
  let value: unknown = input
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input) as unknown
    } catch {
      throw new AiSyncValidationError('AI Sync JSONを解析できません。現在データは変更していません。')
    }
  }

  const result = aiSyncEnvelopeV1Schema.safeParse(value)
  if (!result.success) {
    const issues = formatIssues(result.error)
    throw new AiSyncValidationError('AI Syncデータの検証に失敗しました。現在データは変更していません。', issues)
  }
  return result.data
}

export function safeParseAiSyncEnvelope(input: string | unknown) {
  try {
    return { success: true as const, data: parseAiSyncEnvelope(input) }
  } catch (error) {
    const validationError =
      error instanceof AiSyncValidationError
        ? error
        : new AiSyncValidationError('AI Syncデータを検証できませんでした。')
    return { success: false as const, error: validationError }
  }
}

function mastersFromCatalog(catalog?: CatalogData | MasterCompany[]): MasterCompany[] {
  if (!catalog) return []
  return Array.isArray(catalog) ? catalog : catalog.masterCompanies
}

function canonicalMasterId(masterId: string, masters: MasterCompany[]): string | null {
  const byId = new Map(masters.map((master) => [master.id, master]))
  if (!byId.has(masterId)) return null
  let currentId = masterId
  const visited = new Set<string>()
  while (!visited.has(currentId)) {
    visited.add(currentId)
    const current = byId.get(currentId)
    if (!current || current.status !== 'merged' || !current.mergedIntoId) return currentId
    if (!byId.has(current.mergedIntoId)) return currentId
    currentId = current.mergedIntoId
  }
  return currentId
}

function normalizeCompanyName(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('ja-JP')
    .replace(/株式会社|有限会社|合同会社|\(株\)|（株）|㈱/gu, '')
    .replace(/[\s\u3000]+/gu, ' ')
    .trim()
}

function normalizeDomain(value: string): string {
  const trimmed = value.trim().toLowerCase()
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    return url.hostname.replace(/^www\./u, '')
  } catch {
    return trimmed.replace(/^www\./u, '').replace(/\/$/u, '')
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function resolveCompanyMatch(
  reference: AiCompanyRef,
  data: AppDataV2,
  catalog: CatalogData | MasterCompany[] | undefined,
  allowNew: boolean,
): AiSyncCompanyMatch {
  const masters = mastersFromCatalog(catalog)
  const userCompanies = data.userCompanies

  if (reference.masterCompanyId) {
    const canonicalId = canonicalMasterId(reference.masterCompanyId, masters)
    if (!canonicalId) {
      return {
        status: 'not_found',
        matchedUserCompanyId: null,
        matchedMasterCompanyId: null,
        candidateUserCompanyIds: [],
        candidateMasterCompanyIds: [],
        message: '指定されたMaster Company IDがカタログに存在しません。',
      }
    }
    const candidates = userCompanies.filter((company) => {
      if (!company.masterCompanyId) return false
      return canonicalMasterId(company.masterCompanyId, masters) === canonicalId
    })
    if (candidates.length > 1) {
      return {
        status: 'ambiguous',
        matchedUserCompanyId: null,
        matchedMasterCompanyId: canonicalId,
        candidateUserCompanyIds: candidates.map((company) => company.id),
        candidateMasterCompanyIds: [canonicalId],
        message: '同じMasterに紐づく本人企業が複数あるため、自動反映しません。',
      }
    }
    if (candidates.length === 1) {
      return {
        status: 'matched',
        matchedUserCompanyId: candidates[0].id,
        matchedMasterCompanyId: canonicalId,
        candidateUserCompanyIds: [candidates[0].id],
        candidateMasterCompanyIds: [canonicalId],
        message: 'Master Company IDで一致しました。',
      }
    }
    return {
      status: allowNew ? 'master_only' : 'not_found',
      matchedUserCompanyId: null,
      matchedMasterCompanyId: canonicalId,
      candidateUserCompanyIds: [],
      candidateMasterCompanyIds: [canonicalId],
      message: allowNew
        ? 'Masterは見つかりました。新しい本人企業として追加できます。'
        : 'Masterは見つかりましたが、本人企業として未登録です。',
    }
  }

  const normalizedName = reference.companyName ? normalizeCompanyName(reference.companyName) : null
  const normalizedOfficialDomain = reference.officialDomain
    ? normalizeDomain(reference.officialDomain)
    : null
  const masterByName = normalizedName
    ? masters.filter((master) =>
        [master.legalName, master.displayName, ...master.aliases, ...master.formerNames].some(
          (name) => normalizeCompanyName(name) === normalizedName,
        ),
      )
    : []
  const masterByDomain = normalizedOfficialDomain
    ? masters.filter((master) =>
        master.officialDomains.some(
          (domain) => normalizeDomain(domain) === normalizedOfficialDomain,
        ),
      )
    : []

  let masterCandidates: MasterCompany[]
  if (masterByName.length > 0 && masterByDomain.length > 0) {
    const domainIds = new Set(masterByDomain.map((master) => master.id))
    const intersection = masterByName.filter((master) => domainIds.has(master.id))
    masterCandidates = intersection.length > 0 ? intersection : [...masterByName, ...masterByDomain]
  } else {
    masterCandidates = [...masterByName, ...masterByDomain]
  }
  const canonicalMasterIds = unique(
    masterCandidates
      .map((master) => canonicalMasterId(master.id, masters))
      .filter((id): id is string => Boolean(id)),
  )

  const directUserCandidates = normalizedName
    ? userCompanies.filter(
        (company) => normalizeCompanyName(company.userEnteredName) === normalizedName,
      )
    : []
  const masterLinkedCandidates = userCompanies.filter((company) => {
    if (!company.masterCompanyId) return false
    const canonicalId = canonicalMasterId(company.masterCompanyId, masters)
    return canonicalId !== null && canonicalMasterIds.includes(canonicalId)
  })
  const candidateUserIds = unique(
    [...directUserCandidates, ...masterLinkedCandidates].map((company) => company.id),
  )

  if (canonicalMasterIds.length > 1 || candidateUserIds.length > 1) {
    return {
      status: 'ambiguous',
      matchedUserCompanyId: null,
      matchedMasterCompanyId: null,
      candidateUserCompanyIds: candidateUserIds,
      candidateMasterCompanyIds: canonicalMasterIds,
      message: '企業候補が複数あるため、自動統合・自動反映しません。',
    }
  }
  if (candidateUserIds.length === 1) {
    const company = userCompanies.find((item) => item.id === candidateUserIds[0])
    const linkedCanonical = company?.masterCompanyId
      ? canonicalMasterId(company.masterCompanyId, masters)
      : null
    if (
      canonicalMasterIds.length === 1 &&
      linkedCanonical !== null &&
      linkedCanonical !== canonicalMasterIds[0]
    ) {
      return {
        status: 'ambiguous',
        matchedUserCompanyId: null,
        matchedMasterCompanyId: null,
        candidateUserCompanyIds: candidateUserIds,
        candidateMasterCompanyIds: canonicalMasterIds,
        message: '企業名候補とドメイン候補が矛盾するため、自動反映しません。',
      }
    }
    return {
      status: 'matched',
      matchedUserCompanyId: candidateUserIds[0],
      matchedMasterCompanyId: canonicalMasterIds[0] ?? linkedCanonical,
      candidateUserCompanyIds: candidateUserIds,
      candidateMasterCompanyIds: canonicalMasterIds,
      message: '企業名または公式ドメインから本人企業を1件特定しました。',
    }
  }
  if (canonicalMasterIds.length === 1) {
    return {
      status: allowNew ? 'master_only' : 'not_found',
      matchedUserCompanyId: null,
      matchedMasterCompanyId: canonicalMasterIds[0],
      candidateUserCompanyIds: [],
      candidateMasterCompanyIds: canonicalMasterIds,
      message: allowNew
        ? 'Master候補を特定しました。新しい本人企業として追加できます。'
        : 'Master候補はありますが、本人企業として未登録です。',
    }
  }
  return {
    status: allowNew && Boolean(reference.companyName) ? 'new_custom' : 'not_found',
    matchedUserCompanyId: null,
    matchedMasterCompanyId: null,
    candidateUserCompanyIds: [],
    candidateMasterCompanyIds: [],
    message:
      allowNew && reference.companyName
        ? '一致候補がないため、独自企業として追加できます。'
        : '対象の本人企業を特定できません。',
  }
}

const noCompanyMatch: AiSyncCompanyMatch = {
  status: 'not_required',
  matchedUserCompanyId: null,
  matchedMasterCompanyId: null,
  candidateUserCompanyIds: [],
  candidateMasterCompanyIds: [],
  message: 'この操作では企業照合は不要です。',
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function changesOf(
  fields: Array<{ field: string; label: string; before: unknown; after: unknown }>,
): AiSyncChange[] {
  return fields.filter((field) => !sameValue(field.before, field.after))
}

function previewEntity(
  operation: AiSyncOperation,
  data: AppDataV2,
  match: AiSyncCompanyMatch,
): { targetEntityId: string | null; targetLabel: string; changes: AiSyncChange[]; error?: string } {
  const userCompanyId = match.matchedUserCompanyId
  if (operation.entityType === 'researchFact') {
    const factWithRequestedId = operation.payload.id
      ? data.researchFacts.find((fact) => fact.id === operation.payload.id)
      : undefined
    if (factWithRequestedId && factWithRequestedId.userCompanyId !== userCompanyId) {
      return {
        targetEntityId: null,
        targetLabel: 'Research Fact',
        changes: [],
        error: '指定されたResearch Fact IDは別の本人企業に属します。',
      }
    }
    const target =
      operation.action === 'delete'
        ? factWithRequestedId
        : data.researchFacts.find(
            (fact) =>
              fact.id === operation.payload.id ||
              (fact.userCompanyId === userCompanyId &&
                fact.key === operation.payload.key &&
                fact.recruitingCycle === operation.payload.recruitingCycle &&
                fact.roleScope === operation.payload.roleScope),
          )
    if (operation.action === 'delete') {
      return target
        ? {
            targetEntityId: target.id,
            targetLabel: target.label,
            changes: changesOf([{ field: 'entity', label: 'Research Fact', before: target, after: null }]),
          }
        : { targetEntityId: null, targetLabel: 'Research Fact', changes: [], error: '削除対象のResearch Factが見つかりません。' }
    }
    return {
      targetEntityId: target?.id ?? null,
      targetLabel: operation.payload.label,
      changes: changesOf([
        { field: 'value', label: '値', before: target?.value ?? null, after: operation.payload.value },
        { field: 'verificationLevel', label: '確認状態', before: target?.verificationLevel ?? null, after: operation.payload.verificationLevel },
        { field: 'checkedAt', label: '確認日', before: target?.checkedAt ?? null, after: operation.payload.checkedAt },
        { field: 'sources', label: '出典', before: target?.sources ?? [], after: operation.evidence },
      ]),
    }
  }

  if (operation.entityType === 'selectionEvent') {
    const company = data.userCompanies.find((item) => item.id === userCompanyId)
    const target =
      operation.action === 'delete'
        ? company?.events.find((event) => event.id === operation.payload.id)
        : company?.events.find(
            (event) =>
              event.id === operation.payload.id ||
              (event.type === operation.payload.type &&
                event.title === operation.payload.title &&
                event.scheduledAt === operation.payload.scheduledAt),
          )
    if (operation.action === 'delete') {
      return target
        ? {
            targetEntityId: target.id,
            targetLabel: target.title || target.type,
            changes: changesOf([{ field: 'entity', label: '選考予定', before: target, after: null }]),
          }
        : { targetEntityId: null, targetLabel: '選考予定', changes: [], error: '削除対象の選考予定が見つかりません。' }
    }
    return {
      targetEntityId: target?.id ?? null,
      targetLabel: operation.payload.title || operation.payload.type,
      changes: changesOf([
        { field: 'scheduledAt', label: '日時・締切', before: target?.scheduledAt ?? null, after: operation.payload.scheduledAt },
        { field: 'status', label: '状態', before: target?.status ?? null, after: operation.payload.status },
        { field: 'memo', label: 'メモ', before: target?.memo ?? null, after: operation.payload.memo },
      ]),
    }
  }

  if (operation.entityType === 'watchFinding') {
    const findingWithRequestedId = operation.payload.id
      ? data.watchFindings.find((finding) => finding.id === operation.payload.id)
      : undefined
    if (findingWithRequestedId && findingWithRequestedId.userCompanyId !== userCompanyId) {
      return {
        targetEntityId: null,
        targetLabel: 'Watch Finding',
        changes: [],
        error: '指定されたWatch Finding IDは別の本人企業に属します。',
      }
    }
    const target =
      operation.action === 'delete'
        ? findingWithRequestedId
        : data.watchFindings.find(
            (finding) =>
              finding.id === operation.payload.id ||
              (finding.userCompanyId === userCompanyId &&
                finding.fingerprint === operation.payload.fingerprint),
          )
    if (operation.action === 'delete') {
      return target
        ? {
            targetEntityId: target.id,
            targetLabel: target.title,
            changes: changesOf([{ field: 'entity', label: 'Watch Finding', before: target, after: null }]),
          }
        : { targetEntityId: null, targetLabel: 'Watch Finding', changes: [], error: '削除対象のWatch Findingが見つかりません。' }
    }
    return {
      targetEntityId: target?.id ?? null,
      targetLabel: operation.payload.title,
      changes: changesOf([
        { field: 'summary', label: '概要', before: target?.summary ?? null, after: operation.payload.summary },
        { field: 'deadline', label: '締切', before: target?.deadline ?? null, after: operation.payload.deadline },
        { field: 'severity', label: '重要度', before: target?.severity ?? null, after: operation.payload.severity },
        {
          field: 'status',
          label: '状態',
          before: target?.status ?? null,
          after: target?.status === 'completed' ? 'completed' : operation.payload.status,
        },
      ]),
    }
  }

  if (operation.entityType === 'userCompany') {
    const targetId = operation.payload.id || match.matchedUserCompanyId
    const target = data.userCompanies.find((company) => company.id === targetId)
    if (
      operation.payload.id &&
      target &&
      match.matchedUserCompanyId !== null &&
      match.matchedUserCompanyId !== target.id
    ) {
      return {
        targetEntityId: null,
        targetLabel: '本人企業',
        changes: [],
        error: '指定された本人企業IDとcompanyRefの照合結果が一致しません。',
      }
    }
    if (operation.payload.id && target && match.matchedUserCompanyId === null) {
      return {
        targetEntityId: null,
        targetLabel: '本人企業',
        changes: [],
        error: '指定された本人企業IDをcompanyRefで確認できません。',
      }
    }
    if (operation.action === 'delete') {
      return target
        ? {
            targetEntityId: target.id,
            targetLabel: target.userEnteredName,
            changes: changesOf([{ field: 'entity', label: '本人企業', before: target, after: null }]),
          }
        : { targetEntityId: null, targetLabel: '本人企業', changes: [], error: '削除対象の本人企業が見つかりません。' }
    }
    const nextName =
      operation.payload.userEnteredName || operation.companyRef.companyName || target?.userEnteredName
    if (!nextName) {
      return { targetEntityId: null, targetLabel: '本人企業', changes: [], error: '新規企業の表示名がありません。' }
    }
    return {
      targetEntityId: target?.id ?? null,
      targetLabel: nextName,
      changes: changesOf([
        { field: 'userEnteredName', label: '企業名', before: target?.userEnteredName ?? null, after: nextName },
        { field: 'role', label: '職種', before: target?.role ?? null, after: operation.payload.role ?? target?.role ?? '' },
        { field: 'applicationStatus', label: '応募状況', before: target?.applicationStatus ?? null, after: operation.payload.applicationStatus ?? target?.applicationStatus ?? '検討中' },
      ]),
    }
  }

  const target = data.scoringProfiles.find((profile) => profile.id === operation.payload.id)
  if (operation.action === 'delete') {
    if (!target) return { targetEntityId: null, targetLabel: '評価プロファイル', changes: [], error: '削除対象の評価プロファイルが見つかりません。' }
    if (target.id === data.activeScoringProfileId) {
      return { targetEntityId: target.id, targetLabel: target.name, changes: [], error: '使用中の評価プロファイルは削除できません。' }
    }
    return {
      targetEntityId: target.id,
      targetLabel: target.name,
      changes: changesOf([{ field: 'entity', label: '評価プロファイル', before: target, after: null }]),
    }
  }
  return {
    targetEntityId: target?.id ?? null,
    targetLabel: operation.payload.name,
    changes: changesOf([
      { field: 'name', label: 'プロファイル名', before: target?.name ?? null, after: operation.payload.name },
      { field: 'criteria', label: '評価項目', before: target?.criteria ?? [], after: operation.payload.criteria },
    ]),
  }
}

export function previewAiSync(
  input: string | unknown,
  data: AppDataV2,
  catalog?: CatalogData | MasterCompany[],
): AiSyncPreview {
  const envelope = parseAiSyncEnvelope(input)
  const seenOperationIds = new Set(data.processedOperationIds)
  const items: AiSyncPreviewItem[] = envelope.operations.map((operation) => {
    const duplicate = seenOperationIds.has(operation.operationId)
    seenOperationIds.add(operation.operationId)
    const companyMatch =
      operation.entityType === 'scoringProfile'
        ? noCompanyMatch
        : resolveCompanyMatch(operation.companyRef, data, catalog, operation.entityType === 'userCompany' && operation.action === 'upsert')
    const matchBlocked = companyMatch.status === 'ambiguous' || companyMatch.status === 'not_found'
    const entityPreview = matchBlocked
      ? { targetEntityId: null, targetLabel: operation.entityType, changes: [] }
      : previewEntity(operation, data, companyMatch)
    const blockedMessage = matchBlocked ? companyMatch.message : entityPreview.error
    const status: AiSyncPreviewStatus = duplicate ? 'duplicate' : blockedMessage ? 'blocked' : 'ready'
    return {
      operation,
      status,
      canApply: status === 'ready',
      requiresDeleteConfirmation: operation.action === 'delete',
      companyMatch,
      targetEntityId: entityPreview.targetEntityId,
      targetLabel: entityPreview.targetLabel,
      changes: entityPreview.changes,
      message:
        status === 'duplicate'
          ? 'このoperationIdは処理済み、または同じEnvelope内で重複しています。'
          : blockedMessage ?? (operation.action === 'delete' ? '削除には追加確認が必要です。' : '反映候補です。'),
    }
  })

  return {
    envelope,
    baseRevision: data.revision,
    items,
    readyCount: items.filter((item) => item.status === 'ready').length,
    blockedCount: items.filter((item) => item.status === 'blocked').length,
    duplicateCount: items.filter((item) => item.status === 'duplicate').length,
  }
}

function stableEntityId(prefix: string, operationId: string): string {
  const safeOperationId = operationId.replace(/[^a-zA-Z0-9_-]/gu, '_').slice(0, 80)
  return `${prefix}_${safeOperationId}`
}

function evidenceSources(operation: AiSyncOperation): ResearchSource[] {
  return operation.evidence.map((evidence, index) => ({
    id: evidence.id ?? stableEntityId(`source_${index + 1}`, operation.operationId),
    type: evidence.type,
    title: evidence.title,
    url: evidence.url,
    retrievedAt: evidence.retrievedAt,
    publishedAt: evidence.publishedAt,
    note: evidence.note,
  }))
}

function copyData(data: AppDataV2): AppDataV2 {
  return {
    ...data,
    userCompanies: data.userCompanies.map((company) => ({
      ...company,
      events: company.events.map((event) => ({ ...event })),
    })),
    researchFacts: data.researchFacts.map((fact) => ({
      ...fact,
      sources: fact.sources.map((source) => ({ ...source })),
    })),
    scoringProfiles: data.scoringProfiles.map((profile) => ({
      ...profile,
      criteria: profile.criteria.map((criterion) => ({ ...criterion })),
    })),
    evaluations: data.evaluations.map((evaluation) => ({
      ...evaluation,
      values: { ...evaluation.values },
    })),
    watchRuns: data.watchRuns.map((run) => ({ ...run })),
    watchFindings: data.watchFindings.map((finding) => ({
      ...finding,
      source: finding.source ? { ...finding.source } : null,
    })),
    userSettings: { ...data.userSettings },
    migrationHistory: data.migrationHistory.map((entry) => ({ ...entry })),
    aiImportHistory: data.aiImportHistory.map((entry) => ({
      ...entry,
      appliedOperationIds: [...entry.appliedOperationIds],
      skippedOperationIds: [...entry.skippedOperationIds],
    })),
    processedOperationIds: [...data.processedOperationIds],
  }
}

function requireMatchedCompany(item: AiSyncPreviewItem): UserCompany['id'] {
  const id = item.companyMatch.matchedUserCompanyId
  if (!id) throw new Error(`本人企業を特定できません: ${item.operation.operationId}`)
  return id
}

function applyResearchFact(next: AppDataV2, item: AiSyncPreviewItem, now: string): void {
  const operation = item.operation
  if (operation.entityType !== 'researchFact') return
  if (operation.action === 'delete') {
    next.researchFacts = next.researchFacts.filter((fact) => fact.id !== item.targetEntityId)
    return
  }
  const userCompanyId = requireMatchedCompany(item)
  const company = next.userCompanies.find((candidate) => candidate.id === userCompanyId)
  const index = next.researchFacts.findIndex((fact) => fact.id === item.targetEntityId)
  const current = index >= 0 ? next.researchFacts[index] : null
  const sources = evidenceSources(operation)
  const fact = {
    id: current?.id ?? operation.payload.id ?? stableEntityId('fact_ai', operation.operationId),
    userCompanyId,
    masterCompanyId: company?.masterCompanyId ?? item.companyMatch.matchedMasterCompanyId,
    key: operation.payload.key,
    label: operation.payload.label,
    value: operation.payload.value,
    recruitingCycle: operation.payload.recruitingCycle,
    roleScope: operation.payload.roleScope,
    checkedAt: operation.payload.checkedAt,
    verificationLevel: operation.payload.verificationLevel,
    reviewStatus: operation.payload.reviewStatus,
    processedByAi: operation.payload.processedByAi,
    sources: sources.length > 0 ? sources : current?.sources ?? [],
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  }
  if (index >= 0) next.researchFacts[index] = fact
  else next.researchFacts.push(fact)
}

function applySelectionEvent(next: AppDataV2, item: AiSyncPreviewItem, now: string): void {
  const operation = item.operation
  if (operation.entityType !== 'selectionEvent') return
  const userCompanyId = requireMatchedCompany(item)
  const companyIndex = next.userCompanies.findIndex((company) => company.id === userCompanyId)
  if (companyIndex < 0) throw new Error(`本人企業が見つかりません: ${userCompanyId}`)
  const company = next.userCompanies[companyIndex]
  if (operation.action === 'delete') {
    next.userCompanies[companyIndex] = {
      ...company,
      events: company.events.filter((event) => event.id !== item.targetEntityId),
      updatedAt: now,
    }
    return
  }
  const eventIndex = company.events.findIndex((event) => event.id === item.targetEntityId)
  const event = {
    id: eventIndex >= 0 ? company.events[eventIndex].id : operation.payload.id ?? stableEntityId('event_ai', operation.operationId),
    type: operation.payload.type,
    title: operation.payload.title,
    scheduledAt: operation.payload.scheduledAt,
    status: operation.payload.status,
    location: operation.payload.location,
    memo: operation.payload.memo,
  }
  const events = [...company.events]
  if (eventIndex >= 0) events[eventIndex] = event
  else events.push(event)
  next.userCompanies[companyIndex] = { ...company, events, updatedAt: now }
}

function applyWatchFinding(next: AppDataV2, item: AiSyncPreviewItem, now: string): void {
  const operation = item.operation
  if (operation.entityType !== 'watchFinding') return
  if (operation.action === 'delete') {
    next.watchFindings = next.watchFindings.filter((finding) => finding.id !== item.targetEntityId)
    return
  }
  const userCompanyId = requireMatchedCompany(item)
  const company = next.userCompanies.find((candidate) => candidate.id === userCompanyId)
  const source = evidenceSources(operation)[0] ?? null
  const incoming = {
    id: operation.payload.id ?? stableEntityId('finding_ai', operation.operationId),
    userCompanyId,
    masterCompanyId: company?.masterCompanyId ?? item.companyMatch.matchedMasterCompanyId,
    watchRunId: operation.payload.watchRunId,
    type: operation.payload.type,
    severity: operation.payload.severity,
    title: operation.payload.title,
    summary: operation.payload.summary,
    detectedAt: operation.payload.detectedAt,
    deadline: operation.payload.deadline,
    source,
    status: operation.payload.status,
    fingerprint: operation.payload.fingerprint,
    createdAt: now,
    updatedAt: now,
  }
  next.watchFindings = upsertWatchFinding(next.watchFindings, incoming, now).findings
}

function applyUserCompany(next: AppDataV2, item: AiSyncPreviewItem, now: string): void {
  const operation = item.operation
  if (operation.entityType !== 'userCompany') return
  if (operation.action === 'delete') {
    const targetId = item.targetEntityId
    next.userCompanies = next.userCompanies.filter((company) => company.id !== targetId)
    next.researchFacts = next.researchFacts.filter((fact) => fact.userCompanyId !== targetId)
    next.evaluations = next.evaluations.filter((evaluation) => evaluation.userCompanyId !== targetId)
    next.watchFindings = next.watchFindings.filter((finding) => finding.userCompanyId !== targetId)
    return
  }
  const targetId = operation.payload.id ?? item.companyMatch.matchedUserCompanyId
  const index = next.userCompanies.findIndex((company) => company.id === targetId)
  const current = index >= 0 ? next.userCompanies[index] : null
  const userEnteredName =
    operation.payload.userEnteredName || operation.companyRef.companyName || current?.userEnteredName
  if (!userEnteredName) throw new Error('新規企業の表示名がありません。')
  const company: UserCompany = {
    id: current?.id ?? operation.payload.id ?? stableEntityId('user_company_ai', operation.operationId),
    masterCompanyId: current?.masterCompanyId ?? item.companyMatch.matchedMasterCompanyId,
    userEnteredName,
    role: operation.payload.role ?? current?.role ?? '',
    applicationCategory: operation.payload.applicationCategory ?? current?.applicationCategory ?? '',
    manualPriority: operation.payload.manualPriority ?? current?.manualPriority ?? 'B',
    interest: operation.payload.interest ?? current?.interest ?? 0,
    applicationStatus: operation.payload.applicationStatus ?? current?.applicationStatus ?? '検討中',
    myPageStatus: operation.payload.myPageStatus ?? current?.myPageStatus ?? '未開設',
    applicationUrl: operation.payload.applicationUrl ?? current?.applicationUrl ?? '',
    memo: operation.payload.memo ?? current?.memo ?? '',
    watchEnabled: operation.payload.watchEnabled ?? current?.watchEnabled ?? true,
    events: current?.events ?? [],
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  }
  if (index >= 0) next.userCompanies[index] = company
  else next.userCompanies.push(company)
}

function applyScoringProfile(next: AppDataV2, item: AiSyncPreviewItem, now: string): void {
  const operation = item.operation
  if (operation.entityType !== 'scoringProfile') return
  if (operation.action === 'delete') {
    next.scoringProfiles = next.scoringProfiles.filter((profile) => profile.id !== item.targetEntityId)
    next.evaluations = next.evaluations.filter(
      (evaluation) => evaluation.scoringProfileId !== item.targetEntityId,
    )
    return
  }
  const id = operation.payload.id ?? stableEntityId('profile_ai', operation.operationId)
  const index = next.scoringProfiles.findIndex((profile) => profile.id === id)
  const current = index >= 0 ? next.scoringProfiles[index] : null
  const profile: ScoringProfile = {
    id,
    name: operation.payload.name,
    criteria: operation.payload.criteria.map((criterion) => ({ ...criterion })),
    kind: operation.payload.kind,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  }
  if (index >= 0) next.scoringProfiles[index] = profile
  else next.scoringProfiles.push(profile)
}

function applyItem(next: AppDataV2, item: AiSyncPreviewItem, now: string): void {
  if (item.operation.entityType === 'researchFact') applyResearchFact(next, item, now)
  else if (item.operation.entityType === 'selectionEvent') applySelectionEvent(next, item, now)
  else if (item.operation.entityType === 'watchFinding') applyWatchFinding(next, item, now)
  else if (item.operation.entityType === 'userCompany') applyUserCompany(next, item, now)
  else applyScoringProfile(next, item, now)
}

export function commitAiSyncPreview(
  data: AppDataV2,
  preview: AiSyncPreview,
  selectedOperationIds: Iterable<string>,
  options: AiSyncCommitOptions = {},
): AiSyncCommitResult {
  if (data.revision !== preview.baseRevision) {
    throw new Error('preview後にデータが変更されたため反映を停止しました。もう一度previewしてください。')
  }

  const selected = new Set(selectedOperationIds)
  const confirmedDeletes = new Set(options.confirmedDeleteOperationIds ?? [])
  const now = options.now ?? new Date().toISOString()
  const next = copyData(data)
  const appliedOperationIds: string[] = []
  const deleteConfirmationRequiredIds: string[] = []

  for (const item of preview.items) {
    const operationId = item.operation.operationId
    if (!selected.has(operationId) || item.status !== 'ready') continue
    if (item.requiresDeleteConfirmation && !confirmedDeletes.has(operationId)) {
      deleteConfirmationRequiredIds.push(operationId)
      continue
    }
    applyItem(next, item, now)
    appliedOperationIds.push(operationId)
  }

  const applied = unique(appliedOperationIds)
  if (applied.length === 0) {
    return {
      data,
      appliedOperationIds: [],
      skippedOperationIds: unique(preview.items.map((item) => item.operation.operationId)),
      deleteConfirmationRequiredIds: unique(deleteConfirmationRequiredIds),
    }
  }

  const appliedSet = new Set(applied)
  const skippedOperationIds = unique(
    preview.items
      .map((item) => item.operation.operationId)
      .filter((operationId) => !appliedSet.has(operationId)),
  )
  next.processedOperationIds = unique([...next.processedOperationIds, ...applied])
  next.aiImportHistory.push({
    id: stableEntityId(`ai_import_${next.revision + 1}`, `${preview.envelope.provider}_${now}`),
    provider: preview.envelope.provider,
    envelopeGeneratedAt: preview.envelope.generatedAt,
    importedAt: now,
    appliedOperationIds: applied,
    skippedOperationIds,
  })
  next.revision += 1
  next.updatedAt = now

  return {
    data: next,
    appliedOperationIds: applied,
    skippedOperationIds,
    deleteConfirmationRequiredIds: unique(deleteConfirmationRequiredIds),
  }
}
