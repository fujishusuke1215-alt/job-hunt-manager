import { migrateV1Companies, parseLegacyV1, V1_BACKUP_PREFIX } from '../domain/migration'
import { parseAppDataV2, safeParseAppDataV2 } from '../domain/schemas'
import type { AppDataV2 } from '../domain/types'
import { createId } from '../utils/id'

export const APP_DATA_FILE_NAME = 'job-hunt-manager-data-v2.json'

export type StorageSource = 'local-development' | 'google-drive' | 'supabase'

export interface RemoteFileInfo {
  id: string
  name: string
  version: string
  modifiedTime: string | null
}

export interface ConflictBackup {
  fileName: string
  json: string
  createdAt: string
}

export type StorageConflictReason =
  | 'multiple-remote-files'
  | 'remote-changed'
  | 'remote-missing'
  | 'missing-baseline'
  | 'remote-changing'
  | 'local-changed'

export interface StorageConflict {
  reason: StorageConflictReason
  message: string
  remoteFiles: RemoteFileInfo[]
  remoteData: AppDataV2 | null
  localBackup: ConflictBackup | null
}

export type StorageLoadResult =
  | {
      status: 'empty'
      source: StorageSource
      data: null
      version: null
    }
  | {
      status: 'loaded'
      source: StorageSource
      data: AppDataV2
      version: string
      remoteFile: RemoteFileInfo | null
      migratedFromV1: boolean
      legacyBackup: LegacyBackupInfo | null
    }
  | {
      status: 'conflict'
      source: StorageSource
      data: null
      version: null
      conflict: StorageConflict
    }

export type StorageSaveResult =
  | {
      status: 'saved'
      source: StorageSource
      data: AppDataV2
      version: string
      remoteFile: RemoteFileInfo | null
    }
  | {
      status: 'conflict'
      source: StorageSource
      data: AppDataV2
      version: null
      conflict: StorageConflict
    }

export interface LegacyBackupInfo {
  key: string
  raw: string
}

export interface ImportPreviewSummary {
  userCompanyCount: number
  researchFactCount: number
  scoringProfileCount: number
  watchFindingCount: number
}

export interface ImportPreview {
  previewId: string
  sourceSchemaVersion: 1 | 2
  data: AppDataV2
  raw: string
  legacyBackup: LegacyBackupInfo | null
  summary: ImportPreviewSummary
  warnings: string[]
  requiresConfirmation: true
}

export interface StorageRepository {
  exists(): Promise<boolean>
  load(): Promise<StorageLoadResult>
  save(data: AppDataV2, expectedVersion?: string): Promise<StorageSaveResult>
  exportBackup(data: AppDataV2): string
  importBackup(raw: string): Promise<ImportPreview>
  commitImport(preview: ImportPreview, expectedVersion?: string): Promise<StorageSaveResult>
}

export type StorageErrorCode =
  | 'malformed-json'
  | 'unsupported-schema'
  | 'invalid-backup'
  | 'invalid-remote-data'
  | 'storage-unavailable'
  | 'unauthenticated'
  | 'network-error'
  | 'drive-request-failed'
  | 'invalid-drive-response'
  | 'revision-conflict'
  | 'supabase-request-failed'

export class StorageRepositoryError extends Error {
  readonly code: StorageErrorCode
  readonly status: number | null

  constructor(
    code: StorageErrorCode,
    message: string,
    options: { status?: number; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'StorageRepositoryError'
    this.code = code
    this.status = options.status ?? null
  }
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch (error) {
    throw new StorageRepositoryError(
      'malformed-json',
      'JSONを読み取れません。現在のデータは変更していません。',
      { cause: error },
    )
  }
}

function importSummary(data: AppDataV2): ImportPreviewSummary {
  return {
    userCompanyCount: data.userCompanies.length,
    researchFactCount: data.researchFacts.length,
    scoringProfileCount: data.scoringProfiles.length,
    watchFindingCount: data.watchFindings.length,
  }
}

export function makeLegacyBackupKey(now: string): string {
  return `${V1_BACKUP_PREFIX}${now}`
}

export function createImportPreview(raw: string, now = new Date().toISOString()): ImportPreview {
  const parsed = parseJson(raw)

  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'schemaVersion' in parsed &&
    parsed.schemaVersion === 2
  ) {
    const result = safeParseAppDataV2(parsed)
    if (!result.success) {
      throw new StorageRepositoryError(
        'invalid-backup',
        'v2バックアップの検証に失敗しました。現在のデータは変更していません。',
        { cause: result.error },
      )
    }

    return {
      previewId: createId('import-preview'),
      sourceSchemaVersion: 2,
      data: result.data,
      raw,
      legacyBackup: null,
      summary: importSummary(result.data),
      warnings: [],
      requiresConfirmation: true,
    }
  }

  const isPotentialV1 = Array.isArray(parsed) || (
    typeof parsed === 'object' &&
    parsed !== null &&
    'schemaVersion' in parsed &&
    parsed.schemaVersion === 1
  )

  if (!isPotentialV1) {
    throw new StorageRepositoryError(
      'unsupported-schema',
      '対応していないバックアップ形式です。現在のデータは変更していません。',
    )
  }

  const backupKey = makeLegacyBackupKey(now)
  try {
    const companies = parseLegacyV1(raw)
    const migrated = migrateV1Companies(companies, {
      now,
      sourceKey: 'backup-file:v1',
      backupKey,
    })
    const data = parseAppDataV2(migrated)

    return {
      previewId: createId('import-preview'),
      sourceSchemaVersion: 1,
      data,
      raw,
      legacyBackup: { key: backupKey, raw },
      summary: importSummary(data),
      warnings: [
        'v1の採用情報には出典がないため、未確認のResearch Factとして移行します。',
      ],
      requiresConfirmation: true,
    }
  } catch (error) {
    if (error instanceof StorageRepositoryError) throw error
    throw new StorageRepositoryError(
      'invalid-backup',
      'v1バックアップの検証または移行に失敗しました。現在のデータは変更していません。',
      { cause: error },
    )
  }
}

export function serializeAppDataV2(data: AppDataV2): string {
  return JSON.stringify(parseAppDataV2(data), null, 2)
}

export function createConflictBackup(
  data: AppDataV2,
  now = new Date().toISOString(),
): ConflictBackup {
  const safeTimestamp = now.replace(/[:.]/g, '-')
  return {
    fileName: `job-hunt-manager-conflict-${safeTimestamp}.json`,
    json: serializeAppDataV2(data),
    createdAt: now,
  }
}
