import type { AppDataV2 } from './types'
import { appDataV2Schema } from './schemas'
import { migrateV1Companies, parseLegacyV1 } from './migration'

export interface BackupImportPreview {
  sourceVersion: 1 | 2
  data: AppDataV2
  companyCount: number
  summary: string
}

export function createV2Backup(data: AppDataV2): string {
  return JSON.stringify(appDataV2Schema.parse(data), null, 2)
}

export function previewBackupImport(
  raw: string,
  now = new Date().toISOString(),
): BackupImportPreview {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('JSONの構文が正しくありません。現在データは変更していません。')
  }

  const v2 = appDataV2Schema.safeParse(parsed)
  if (v2.success) {
    return {
      sourceVersion: 2,
      data: v2.data,
      companyCount: v2.data.userCompanies.length,
      summary: `schemaVersion 2の${v2.data.userCompanies.length}社を取り込む候補です。`,
    }
  }

  try {
    const companies = parseLegacyV1(raw)
    const backupKey = `manual-import:${now}`
    return {
      sourceVersion: 1,
      data: migrateV1Companies(companies, { now, sourceKey: 'manual-v1-import', backupKey }),
      companyCount: companies.length,
      summary: `schemaVersion 1の${companies.length}社をv2へ移行して取り込む候補です。`,
    }
  } catch {
    throw new Error('対応していないバックアップ形式です。現在データは変更していません。')
  }
}

export function createAiAnalysisExport(data: AppDataV2, includePersonalNotes = false): string {
  const safeData = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    userCompanies: data.userCompanies.map((company) => ({
      id: company.id,
      masterCompanyId: company.masterCompanyId,
      userEnteredName: company.userEnteredName,
      role: company.role,
      applicationCategory: company.applicationCategory,
      manualPriority: company.manualPriority,
      interest: company.interest,
      applicationStatus: company.applicationStatus,
      watchEnabled: company.watchEnabled,
      events: company.events.map((event) => ({
        id: event.id,
        type: event.type,
        title: event.title,
        scheduledAt: event.scheduledAt,
        status: event.status,
        ...(includePersonalNotes ? { location: event.location, memo: event.memo } : {}),
      })),
      ...(includePersonalNotes ? { memo: company.memo } : {}),
    })),
    researchFacts: data.researchFacts,
    scoringProfiles: data.scoringProfiles,
    activeScoringProfileId: data.activeScoringProfileId,
    evaluations: data.evaluations,
    watchFindings: data.watchFindings,
  }
  return JSON.stringify(safeData, null, 2)
}

