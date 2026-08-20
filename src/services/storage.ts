import type { BackupData, Company } from '../types'

export const STORAGE_KEY = 'job-hunt-manager:personal-companies:v1'

function isCompanyArray(value: unknown): value is Company[] {
  if (!Array.isArray(value)) return false
  return value.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Company).id === 'string' &&
      typeof (item as Company).name === 'string' &&
      Array.isArray((item as Company).events),
  )
}

export function loadPersonalCompanies(storage: Pick<Storage, 'getItem'> = localStorage): Company[] {
  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return isCompanyArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function savePersonalCompanies(
  companies: Company[],
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(companies))
}

export function createBackup(companies: Company[], now = new Date()): BackupData {
  return { schemaVersion: 1, exportedAt: now.toISOString(), companies }
}

export function parseBackup(raw: string): BackupData {
  const parsed: unknown = JSON.parse(raw)
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as BackupData).schemaVersion !== 1 ||
    !isCompanyArray((parsed as BackupData).companies)
  ) {
    throw new Error('対応していないバックアップ形式です。')
  }
  return parsed as BackupData
}

