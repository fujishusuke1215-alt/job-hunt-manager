import { parseAppDataV2 } from '../domain/schemas'
import type { AppDataV2 } from '../domain/types'
import {
  APP_DATA_FILE_NAME,
  createConflictBackup,
  createImportPreview,
  serializeAppDataV2,
  StorageRepositoryError,
  type ImportPreview,
  type RemoteFileInfo,
  type StorageConflict,
  type StorageLoadResult,
  type StorageRepository,
  type StorageSaveResult,
} from './types'

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3'
const TRANSIENT_403_REASONS = new Set([
  'rateLimitExceeded',
  'userRateLimitExceeded',
  'sharingRateLimitExceeded',
  'backendError',
])
const RETRYABLE_SERVER_STATUSES = new Set([500, 502, 503, 504])

export interface DriveFileMetadata {
  id: string
  name: string
  version: string
  modifiedTime: string | null
}

export interface GoogleDriveTransport {
  listAppDataFiles(fileName: string): Promise<DriveFileMetadata[]>
  getFileMetadata(fileId: string): Promise<DriveFileMetadata>
  downloadFile(fileId: string): Promise<string>
  createJsonFile(fileName: string, content: string): Promise<DriveFileMetadata>
  updateJsonFile(fileId: string, content: string): Promise<DriveFileMetadata>
}

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export interface GoogleDriveRestTransportOptions {
  getAccessToken: () => string | null
  fetch?: FetchLike
  sleep?: (milliseconds: number) => Promise<void>
  random?: () => number
  maxAttempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
}

interface DriveErrorDetails {
  message: string
  reasons: string[]
}

export class GoogleDriveRequestError extends StorageRepositoryError {
  readonly reason: string | null
  readonly attempts: number

  constructor(
    message: string,
    options: { status: number; reason?: string; attempts: number; cause?: unknown },
  ) {
    super('drive-request-failed', message, { status: options.status, cause: options.cause })
    this.name = 'GoogleDriveRequestError'
    this.reason = options.reason ?? null
    this.attempts = options.attempts
  }
}

function defaultFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init)
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function driveMetadata(value: unknown): DriveFileMetadata {
  if (typeof value !== 'object' || value === null) {
    throw new StorageRepositoryError('invalid-drive-response', 'Driveから不正な応答を受け取りました。')
  }
  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.name !== 'string' ||
    (typeof candidate.version !== 'string' && typeof candidate.version !== 'number') ||
    (candidate.modifiedTime !== undefined && typeof candidate.modifiedTime !== 'string')
  ) {
    throw new StorageRepositoryError('invalid-drive-response', 'Driveファイル情報の形式が不正です。')
  }
  return {
    id: candidate.id,
    name: candidate.name,
    version: String(candidate.version),
    modifiedTime: typeof candidate.modifiedTime === 'string' ? candidate.modifiedTime : null,
  }
}

async function readDriveError(response: Response): Promise<DriveErrorDetails> {
  try {
    const body = await response.clone().json() as {
      error?: { message?: unknown; errors?: Array<{ reason?: unknown }> }
    }
    const reasons = Array.isArray(body.error?.errors)
      ? body.error.errors.flatMap((entry) => typeof entry.reason === 'string' ? [entry.reason] : [])
      : []
    return {
      message: typeof body.error?.message === 'string' ? body.error.message : response.statusText,
      reasons,
    }
  } catch {
    return { message: response.statusText || `HTTP ${response.status}`, reasons: [] }
  }
}

export class GoogleDriveRestTransport implements GoogleDriveTransport {
  private readonly getAccessToken: () => string | null
  private readonly fetcher: FetchLike
  private readonly sleep: (milliseconds: number) => Promise<void>
  private readonly random: () => number
  private readonly maxAttempts: number
  private readonly baseDelayMs: number
  private readonly maxDelayMs: number

  constructor(options: GoogleDriveRestTransportOptions) {
    this.getAccessToken = options.getAccessToken
    this.fetcher = options.fetch ?? defaultFetch
    this.sleep = options.sleep ?? defaultSleep
    this.random = options.random ?? Math.random
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 4)
    this.baseDelayMs = Math.max(0, options.baseDelayMs ?? 500)
    this.maxDelayMs = Math.max(this.baseDelayMs, options.maxDelayMs ?? 8_000)
  }

  async listAppDataFiles(fileName: string): Promise<DriveFileMetadata[]> {
    const files: DriveFileMetadata[] = []
    let pageToken: string | null = null
    let pageCount = 0

    do {
      const params = new URLSearchParams({
        spaces: 'appDataFolder',
        q: `name = '${fileName.replaceAll("'", "\\'")}' and trashed = false`,
        fields: 'nextPageToken,files(id,name,version,modifiedTime)',
        pageSize: '100',
      })
      if (pageToken !== null) params.set('pageToken', pageToken)
      const response = await this.request(`${DRIVE_API_BASE}/files?${params.toString()}`)
      const body = await response.json() as { files?: unknown; nextPageToken?: unknown }
      if (!Array.isArray(body.files)) {
        throw new StorageRepositoryError('invalid-drive-response', 'Driveファイル一覧の形式が不正です。')
      }
      files.push(...body.files.map(driveMetadata))
      pageToken = typeof body.nextPageToken === 'string' && body.nextPageToken ? body.nextPageToken : null
      pageCount += 1
      if (pageCount > 100) {
        throw new StorageRepositoryError('invalid-drive-response', 'Drive一覧のページ数が上限を超えました。')
      }
    } while (pageToken !== null)

    return files
  }

  async getFileMetadata(fileId: string): Promise<DriveFileMetadata> {
    const params = new URLSearchParams({ fields: 'id,name,version,modifiedTime' })
    const response = await this.request(
      `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?${params.toString()}`,
    )
    return driveMetadata(await response.json() as unknown)
  }

  async downloadFile(fileId: string): Promise<string> {
    const params = new URLSearchParams({ alt: 'media' })
    const response = await this.request(
      `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?${params.toString()}`,
    )
    return response.text()
  }

  async createJsonFile(fileName: string, content: string): Promise<DriveFileMetadata> {
    const boundary = `job-hunt-manager-${Date.now()}-${Math.floor(this.random() * 1_000_000)}`
    const metadata = JSON.stringify({
      name: fileName,
      mimeType: 'application/json',
      parents: ['appDataFolder'],
    })
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      metadata,
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      content,
      `--${boundary}--`,
      '',
    ].join('\r\n')
    const params = new URLSearchParams({
      uploadType: 'multipart',
      fields: 'id,name,version,modifiedTime',
    })
    const response = await this.request(`${DRIVE_UPLOAD_BASE}/files?${params.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    })
    return driveMetadata(await response.json() as unknown)
  }

  async updateJsonFile(fileId: string, content: string): Promise<DriveFileMetadata> {
    const params = new URLSearchParams({ uploadType: 'media', fields: 'id,name,version,modifiedTime' })
    const response = await this.request(
      `${DRIVE_UPLOAD_BASE}/files/${encodeURIComponent(fileId)}?${params.toString()}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: content,
      },
    )
    return driveMetadata(await response.json() as unknown)
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    let lastNetworkError: unknown

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const accessToken = this.getAccessToken()
      if (!accessToken) {
        throw new StorageRepositoryError(
          'unauthenticated',
          'Googleアクセストークンがありません。もう一度ログインしてください。',
        )
      }

      const headers = new Headers(init.headers)
      headers.set('Authorization', `Bearer ${accessToken}`)
      headers.set('Accept', 'application/json')

      try {
        const response = await this.fetcher(url, { ...init, headers })
        if (response.ok) return response

        const details = await readDriveError(response)
        const retryable = this.isRetryable(response.status, details.reasons)
        if (!retryable || attempt === this.maxAttempts) {
          throw new GoogleDriveRequestError(
            `Google Drive APIに失敗しました（HTTP ${response.status}: ${details.message}）。`,
            {
              status: response.status,
              reason: details.reasons[0],
              attempts: attempt,
            },
          )
        }
      } catch (error) {
        if (error instanceof GoogleDriveRequestError || error instanceof StorageRepositoryError) {
          throw error
        }
        lastNetworkError = error
        if (attempt === this.maxAttempts) {
          throw new StorageRepositoryError(
            'network-error',
            'Google Driveへの接続に繰り返し失敗しました。ローカル案を書き出してから再試行してください。',
            { cause: error },
          )
        }
      }

      const exponential = this.baseDelayMs * (2 ** (attempt - 1))
      const jitter = this.random() * this.baseDelayMs
      await this.sleep(Math.min(this.maxDelayMs, exponential + jitter))
    }

    throw new StorageRepositoryError(
      'network-error',
      'Google Driveへの接続に失敗しました。',
      { cause: lastNetworkError },
    )
  }

  private isRetryable(status: number, reasons: string[]): boolean {
    if (status === 429 || RETRYABLE_SERVER_STATUSES.has(status)) return true
    return status === 403 && reasons.some((reason) => TRANSIENT_403_REASONS.has(reason))
  }
}

interface DriveVersionToken {
  kind: 'google-drive'
  fileId: string
  driveVersion: string
  revision: number
}

interface StableRemote {
  metadata: DriveFileMetadata
  data: AppDataV2
}

class RemoteChangingError extends Error {}

function encodeVersionToken(metadata: DriveFileMetadata, revision: number): string {
  const payload: DriveVersionToken = {
    kind: 'google-drive',
    fileId: metadata.id,
    driveVersion: metadata.version,
    revision,
  }
  return `gdrive:${encodeURIComponent(JSON.stringify(payload))}`
}

function decodeVersionToken(value: string): DriveVersionToken | null {
  if (!value.startsWith('gdrive:')) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(value.slice('gdrive:'.length))) as unknown
    if (typeof parsed !== 'object' || parsed === null) return null
    const candidate = parsed as Partial<DriveVersionToken>
    if (
      candidate.kind !== 'google-drive' ||
      typeof candidate.fileId !== 'string' ||
      typeof candidate.driveVersion !== 'string' ||
      typeof candidate.revision !== 'number' ||
      !Number.isInteger(candidate.revision)
    ) return null
    return candidate as DriveVersionToken
  } catch {
    return null
  }
}

function remoteFile(metadata: DriveFileMetadata): RemoteFileInfo {
  return { ...metadata }
}

export interface GoogleDriveStorageOptions {
  transport: GoogleDriveTransport
  now?: () => string
  fileName?: string
  legacyBackupStorage?: Pick<Storage, 'setItem'> | null
}

export class GoogleDriveStorageRepository implements StorageRepository {
  private readonly transport: GoogleDriveTransport
  private readonly now: () => string
  private readonly fileName: string
  private readonly legacyBackupStorage: Pick<Storage, 'setItem'> | null
  private lastKnown: { fileId: string; token: string } | null = null

  constructor(options: GoogleDriveStorageOptions) {
    this.transport = options.transport
    this.now = options.now ?? (() => new Date().toISOString())
    this.fileName = options.fileName ?? APP_DATA_FILE_NAME
    this.legacyBackupStorage = options.legacyBackupStorage ?? (
      typeof localStorage === 'undefined' ? null : localStorage
    )
  }

  async exists(): Promise<boolean> {
    return (await this.transport.listAppDataFiles(this.fileName)).length > 0
  }

  async load(): Promise<StorageLoadResult> {
    const files = await this.transport.listAppDataFiles(this.fileName)
    if (files.length === 0) {
      this.lastKnown = null
      return { status: 'empty', source: 'google-drive', data: null, version: null }
    }
    if (files.length > 1) {
      this.lastKnown = null
      return this.loadConflict(
        'multiple-remote-files',
        '同名のDriveデータが複数あります。自動選択せず同期を停止しました。',
        files,
      )
    }

    try {
      const stable = await this.readStable(files[0])
      const token = encodeVersionToken(stable.metadata, stable.data.revision)
      this.lastKnown = { fileId: stable.metadata.id, token }
      return {
        status: 'loaded',
        source: 'google-drive',
        data: stable.data,
        version: token,
        remoteFile: remoteFile(stable.metadata),
        migratedFromV1: false,
        legacyBackup: null,
      }
    } catch (error) {
      if (error instanceof RemoteChangingError) {
        this.lastKnown = null
        return this.loadConflict(
          'remote-changing',
          'Driveデータが読み込み中にも変更されたため、同期を停止しました。',
          files,
        )
      }
      throw error
    }
  }

  async save(data: AppDataV2, expectedVersion?: string): Promise<StorageSaveResult> {
    const validated = parseAppDataV2(data)
    const files = await this.transport.listAppDataFiles(this.fileName)
    if (files.length > 1) {
      return this.saveConflict(
        validated,
        'multiple-remote-files',
        '同名のDriveデータが複数あるため、上書きを停止しました。',
        files,
      )
    }

    if (files.length === 0) {
      if (expectedVersion !== undefined || this.lastKnown !== null) {
        return this.saveConflict(
          validated,
          'remote-missing',
          '読み込み後にDriveデータが削除されたため、新規作成で上書きせず停止しました。',
          [],
        )
      }

      const created = parseAppDataV2({
        ...validated,
        revision: Math.max(1, validated.revision),
        updatedAt: this.now(),
      })
      const metadata = await this.transport.createJsonFile(this.fileName, serializeAppDataV2(created))
      const token = encodeVersionToken(metadata, created.revision)
      this.lastKnown = { fileId: metadata.id, token }
      return {
        status: 'saved',
        source: 'google-drive',
        data: created,
        version: token,
        remoteFile: remoteFile(metadata),
      }
    }

    let stable: StableRemote
    try {
      stable = await this.readStable(files[0])
    } catch (error) {
      if (error instanceof RemoteChangingError) {
        return this.saveConflict(
          validated,
          'remote-changing',
          'Driveデータが確認中にも変更されたため、上書きを停止しました。',
          files,
        )
      }
      throw error
    }

    const baselineValue = expectedVersion ?? (
      this.lastKnown?.fileId === stable.metadata.id ? this.lastKnown.token : null
    )
    const baseline = baselineValue === null ? null : decodeVersionToken(baselineValue)
    if (baseline === null) {
      return this.saveConflict(
        validated,
        'missing-baseline',
        '読み込んだ時点のversionとrevisionがないため、安全のため上書きを停止しました。',
        [stable.metadata],
        stable.data,
      )
    }

    if (
      baseline.fileId !== stable.metadata.id ||
      baseline.driveVersion !== stable.metadata.version ||
      baseline.revision !== stable.data.revision
    ) {
      return this.saveConflict(
        validated,
        'remote-changed',
        '読み込み後にDriveデータのversionまたはrevisionが変更されたため、上書きを停止しました。',
        [stable.metadata],
        stable.data,
      )
    }

    const saved = parseAppDataV2({
      ...validated,
      revision: Math.max(stable.data.revision + 1, validated.revision),
      updatedAt: this.now(),
    })
    const metadata = await this.transport.updateJsonFile(
      stable.metadata.id,
      serializeAppDataV2(saved),
    )
    const token = encodeVersionToken(metadata, saved.revision)
    this.lastKnown = { fileId: metadata.id, token }
    return {
      status: 'saved',
      source: 'google-drive',
      data: saved,
      version: token,
      remoteFile: remoteFile(metadata),
    }
  }

  exportBackup(data: AppDataV2): string {
    return serializeAppDataV2(data)
  }

  async importBackup(raw: string): Promise<ImportPreview> {
    return createImportPreview(raw, this.now())
  }

  async commitImport(preview: ImportPreview, expectedVersion?: string): Promise<StorageSaveResult> {
    const verifiedPreview = createImportPreview(preview.raw, this.now())
    if (verifiedPreview.legacyBackup !== null && this.legacyBackupStorage !== null) {
      this.legacyBackupStorage.setItem(
        verifiedPreview.legacyBackup.key,
        verifiedPreview.legacyBackup.raw,
      )
    }
    return this.save(verifiedPreview.data, expectedVersion)
  }

  private async readStable(file: DriveFileMetadata): Promise<StableRemote> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const before = await this.transport.getFileMetadata(file.id)
      const raw = await this.transport.downloadFile(file.id)
      const after = await this.transport.getFileMetadata(file.id)
      if (before.version !== after.version) continue

      try {
        return { metadata: after, data: parseAppDataV2(JSON.parse(raw) as unknown) }
      } catch (error) {
        throw new StorageRepositoryError(
          'invalid-remote-data',
          'Drive上のデータがschema v2として不正です。上書きは行っていません。',
          { cause: error },
        )
      }
    }
    throw new RemoteChangingError('remote changed while reading')
  }

  private loadConflict(
    reason: StorageConflict['reason'],
    message: string,
    files: DriveFileMetadata[],
  ): StorageLoadResult {
    return {
      status: 'conflict',
      source: 'google-drive',
      data: null,
      version: null,
      conflict: {
        reason,
        message,
        remoteFiles: files.map(remoteFile),
        remoteData: null,
        localBackup: null,
      },
    }
  }

  private saveConflict(
    data: AppDataV2,
    reason: StorageConflict['reason'],
    message: string,
    files: DriveFileMetadata[],
    remoteData: AppDataV2 | null = null,
  ): StorageSaveResult {
    return {
      status: 'conflict',
      source: 'google-drive',
      data,
      version: null,
      conflict: {
        reason,
        message,
        remoteFiles: files.map(remoteFile),
        remoteData,
        localBackup: createConflictBackup(data, this.now()),
      },
    }
  }
}
