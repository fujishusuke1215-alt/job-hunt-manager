import {
  migrateV1Companies,
  parseLegacyV1,
  V1_STORAGE_KEY,
  V2_STORAGE_KEY,
} from '../domain/migration'
import { parseAppDataV2 } from '../domain/schemas'
import type { AppDataV2 } from '../domain/types'
import { makeLegacyBackupKey, serializeAppDataV2 } from '../repositories/types'

export type LocalCandidateSource = 'v1' | 'v2'
export const DRIVE_MIGRATION_MARKER_PREFIX = 'job-hunt-manager:drive-local-decision:'

export interface LocalDriveCandidate {
  source: LocalCandidateSource
  raw: string
  data: AppDataV2
  backupKey: string | null
  updatedAt: string
}

export interface LocalCandidateInspection {
  candidate: LocalDriveCandidate | null
  warning: string | null
}

type ReadonlyStorage = Pick<Storage, 'getItem'>

export function inspectLocalDriveCandidate(
  storage: ReadonlyStorage,
  now = new Date().toISOString(),
): LocalCandidateInspection {
  const v2Raw = storage.getItem(V2_STORAGE_KEY)
  if (v2Raw !== null) {
    try {
      const data = parseAppDataV2(JSON.parse(v2Raw) as unknown)
      return {
        candidate: {
          source: 'v2',
          raw: v2Raw,
          data,
          backupKey: null,
          updatedAt: data.updatedAt,
        },
        warning: null,
      }
    } catch {
      return {
        candidate: null,
        warning: 'この端末のlocalStorage v2は検証に失敗しました。Driveや端末データを自動上書きしていません。',
      }
    }
  }

  const v1Raw = storage.getItem(V1_STORAGE_KEY)
  if (v1Raw === null) return { candidate: null, warning: null }

  try {
    const backupKey = makeLegacyBackupKey(now)
    const data = parseAppDataV2(migrateV1Companies(parseLegacyV1(v1Raw), {
      now,
      sourceKey: V1_STORAGE_KEY,
      backupKey,
    }))
    return {
      candidate: {
        source: 'v1',
        raw: v1Raw,
        data,
        backupKey,
        updatedAt: data.updatedAt,
      },
      warning: null,
    }
  } catch {
    return {
      candidate: null,
      warning: 'この端末のlocalStorage v1は検証に失敗しました。Driveや端末データを自動上書きしていません。',
    }
  }
}

export function isSameAppData(left: AppDataV2, right: AppDataV2): boolean {
  return serializeAppDataV2(left) === serializeAppDataV2(right)
}

export function localCandidateFingerprint(candidate: Pick<LocalDriveCandidate, 'source' | 'raw'>): string {
  let hash = 0x811c9dc5
  const value = `${candidate.source}\0${candidate.raw}`
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${candidate.source}:${(hash >>> 0).toString(16)}:${candidate.raw.length}`
}

export function driveMigrationMarkerKey(accountId: string): string {
  return `${DRIVE_MIGRATION_MARKER_PREFIX}${accountId}`
}
