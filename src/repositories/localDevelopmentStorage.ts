import {
  createEmptyAppData,
  migrateV1Companies,
  parseLegacyV1,
  V1_STORAGE_KEY,
  V2_STORAGE_KEY,
} from '../domain/migration'
import { parseAppDataV2 } from '../domain/schemas'
import type { AppDataV2 } from '../domain/types'
import {
  createConflictBackup,
  createImportPreview,
  makeLegacyBackupKey,
  serializeAppDataV2,
  StorageRepositoryError,
  type ImportPreview,
  type LegacyBackupInfo,
  type StorageConflict,
  type StorageLoadResult,
  type StorageRepository,
  type StorageSaveResult,
} from './types'

export interface LocalStorageAdapter {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface LocalDevelopmentStorageOptions {
  storage?: LocalStorageAdapter
  now?: () => string
}

function browserLocalStorage(): LocalStorageAdapter {
  if (typeof localStorage === 'undefined') {
    throw new StorageRepositoryError(
      'storage-unavailable',
      'この環境ではローカル開発用ストレージを利用できません。',
    )
  }
  return localStorage
}

function localVersion(data: AppDataV2): string {
  return `local:${data.revision}:${encodeURIComponent(data.updatedAt)}`
}

function localFile(data: AppDataV2) {
  return {
    id: V2_STORAGE_KEY,
    name: V2_STORAGE_KEY,
    version: localVersion(data),
    modifiedTime: data.updatedAt,
  }
}

export class LocalDevelopmentStorageRepository implements StorageRepository {
  private readonly storage: LocalStorageAdapter
  private readonly now: () => string
  private lastKnownVersion: string | null = null

  constructor(options: LocalDevelopmentStorageOptions = {}) {
    this.storage = options.storage ?? browserLocalStorage()
    this.now = options.now ?? (() => new Date().toISOString())
  }

  async exists(): Promise<boolean> {
    return this.storage.getItem(V2_STORAGE_KEY) !== null || this.storage.getItem(V1_STORAGE_KEY) !== null
  }

  async load(): Promise<StorageLoadResult> {
    const currentRaw = this.storage.getItem(V2_STORAGE_KEY)
    if (currentRaw !== null) {
      const data = this.parseStoredV2(currentRaw)
      const version = localVersion(data)
      this.lastKnownVersion = version
      return {
        status: 'loaded',
        source: 'local-development',
        data,
        version,
        remoteFile: null,
        migratedFromV1: false,
        legacyBackup: null,
      }
    }

    const legacyRaw = this.storage.getItem(V1_STORAGE_KEY)
    if (legacyRaw === null) {
      this.lastKnownVersion = null
      return { status: 'empty', source: 'local-development', data: null, version: null }
    }

    const migratedAt = this.now()
    const backupKey = this.availableLegacyBackupKey(migratedAt)
    const legacyBackup = { key: backupKey, raw: legacyRaw }

    // Validationより先に原文を退避する。移行に失敗してもv1キーと退避原文は残す。
    this.storage.setItem(backupKey, legacyRaw)

    try {
      const companies = parseLegacyV1(legacyRaw)
      const migrated = parseAppDataV2(migrateV1Companies(companies, {
        now: migratedAt,
        sourceKey: V1_STORAGE_KEY,
        backupKey,
      }))
      this.writeVerified(migrated, null)
      const version = localVersion(migrated)
      this.lastKnownVersion = version

      return {
        status: 'loaded',
        source: 'local-development',
        data: migrated,
        version,
        remoteFile: null,
        migratedFromV1: true,
        legacyBackup,
      }
    } catch (error) {
      if (error instanceof StorageRepositoryError) throw error
      throw new StorageRepositoryError(
        'invalid-backup',
        'v1データの検証または移行に失敗しました。v1原文と退避コピーは保持しています。',
        { cause: error },
      )
    }
  }

  async save(data: AppDataV2, expectedVersion?: string): Promise<StorageSaveResult> {
    const validated = parseAppDataV2(data)
    const currentRaw = this.storage.getItem(V2_STORAGE_KEY)

    if (currentRaw === null) {
      if (expectedVersion !== undefined) {
        return this.conflict(validated, 'remote-missing', '読み込み後にローカルデータが削除されました。')
      }

      const created = parseAppDataV2({
        ...validated,
        revision: Math.max(1, validated.revision),
        updatedAt: this.now(),
      })
      this.writeVerified(created, null)
      const version = localVersion(created)
      this.lastKnownVersion = version
      return {
        status: 'saved',
        source: 'local-development',
        data: created,
        version,
        remoteFile: null,
      }
    }

    const current = this.parseStoredV2(currentRaw)
    const currentVersion = localVersion(current)
    const baseline = expectedVersion ?? this.lastKnownVersion

    if (baseline === null) {
      return this.conflict(
        validated,
        'missing-baseline',
        '現在のデータを読み込んでいないため、安全のため上書きを停止しました。',
        current,
      )
    }

    if (baseline !== currentVersion) {
      return this.conflict(
        validated,
        'local-changed',
        '別のタブ等でローカルデータが変更されたため、上書きを停止しました。',
        current,
      )
    }

    const saved = parseAppDataV2({
      ...validated,
      revision: Math.max(current.revision + 1, validated.revision),
      updatedAt: this.now(),
    })
    this.writeVerified(saved, currentRaw)
    const version = localVersion(saved)
    this.lastKnownVersion = version

    return {
      status: 'saved',
      source: 'local-development',
      data: saved,
      version,
      remoteFile: null,
    }
  }

  exportBackup(data: AppDataV2): string {
    return serializeAppDataV2(data)
  }

  async importBackup(raw: string): Promise<ImportPreview> {
    return createImportPreview(raw, this.now())
  }

  async commitImport(preview: ImportPreview, expectedVersion?: string): Promise<StorageSaveResult> {
    // 渡されたpreviewを信用せず、commit直前に原文から再検証する。
    const verifiedPreview = createImportPreview(preview.raw, this.now())
    if (verifiedPreview.legacyBackup !== null) {
      this.storage.setItem(verifiedPreview.legacyBackup.key, verifiedPreview.legacyBackup.raw)
    }
    return this.save(verifiedPreview.data, expectedVersion)
  }

  createInitialData(): AppDataV2 {
    return createEmptyAppData(this.now())
  }

  private parseStoredV2(raw: string): AppDataV2 {
    try {
      return parseAppDataV2(JSON.parse(raw) as unknown)
    } catch (error) {
      throw new StorageRepositoryError(
        'invalid-remote-data',
        '保存済みv2データの検証に失敗しました。上書きは行っていません。',
        { cause: error },
      )
    }
  }

  private writeVerified(data: AppDataV2, previousRaw: string | null): void {
    const raw = serializeAppDataV2(data)
    try {
      this.storage.setItem(V2_STORAGE_KEY, raw)
      const written = this.storage.getItem(V2_STORAGE_KEY)
      if (written === null) {
        throw new Error('保存後の読み戻しに失敗しました。')
      }
      parseAppDataV2(JSON.parse(written) as unknown)
    } catch (error) {
      try {
        if (previousRaw === null) this.storage.removeItem(V2_STORAGE_KEY)
        else this.storage.setItem(V2_STORAGE_KEY, previousRaw)
      } catch {
        // 復旧自体が失敗した場合も、元の保存エラーを利用者へ返す。
      }
      throw new StorageRepositoryError(
        'storage-unavailable',
        'ローカル保存と読み戻し確認に失敗しました。',
        { cause: error },
      )
    }
  }

  private availableLegacyBackupKey(now: string): string {
    const base = makeLegacyBackupKey(now)
    if (this.storage.getItem(base) === null) return base
    let suffix = 1
    while (this.storage.getItem(`${base}:${suffix}`) !== null) suffix += 1
    return `${base}:${suffix}`
  }

  private conflict(
    data: AppDataV2,
    reason: StorageConflict['reason'],
    message: string,
    remoteData: AppDataV2 | null = null,
  ): StorageSaveResult {
    return {
      status: 'conflict',
      source: 'local-development',
      data,
      version: null,
      conflict: {
        reason,
        message,
        remoteFiles: remoteData === null ? [] : [localFile(remoteData)],
        remoteData,
        localBackup: createConflictBackup(data, this.now()),
      },
    }
  }
}

export function preserveLegacyBackup(
  storage: LocalStorageAdapter,
  backup: LegacyBackupInfo,
): void {
  storage.setItem(backup.key, backup.raw)
}
