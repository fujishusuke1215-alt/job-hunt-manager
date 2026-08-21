import { z } from 'zod'

const eligibilitySchema = z.enum(['応募可', '応募不可', '要確認'])
const applicationStatusSchema = z.enum([
  '検討中', '応募準備', 'ES提出待ち', 'Webテスト待ち', 'コーディングテスト待ち',
  '面接待ち', '結果待ち', '内定', '終了',
])

export const legacySelectionEventSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['エントリー', '説明会', 'ES', 'Webテスト', 'コーディングテスト', '面接', 'その他']),
  title: z.string(),
  scheduledAt: z.string(),
  status: z.enum(['予定', '完了', '結果待ち', '見送り']),
  location: z.string(),
  memo: z.string(),
}).strict()

export const legacyCompanyV1Schema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string(),
  applicationCategory: z.string(),
  priority: z.enum(['A', 'B', 'C']),
  interest: z.number().finite(),
  status: applicationStatusSchema,
  graduateEligibility: eligibilitySchema,
  existingGraduateEligibility: eligibilitySchema,
  workExperienceEligibility: eligibilitySchema,
  webTest: z.string(),
  codingTest: z.string(),
  myPageStatus: z.enum(['未開設', '開設済み', '不要']),
  applicationUrl: z.string(),
  memo: z.string(),
  scores: z.object({
    salary: z.number().finite(),
    benefits: z.number().finite(),
    wlb: z.number().finite(),
    remote: z.number().finite(),
    flex: z.number().finite(),
    overseas: z.number().finite(),
    itFit: z.number().finite(),
  }).strict(),
  events: z.array(legacySelectionEventSchema),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict()

export const legacyCompaniesV1Schema = z.array(legacyCompanyV1Schema)

export const legacyBackupV1Schema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.string(),
  companies: legacyCompaniesV1Schema,
}).strict()

export type LegacyCompanyV1 = z.infer<typeof legacyCompanyV1Schema>
export type LegacyBackupV1 = z.infer<typeof legacyBackupV1Schema>

