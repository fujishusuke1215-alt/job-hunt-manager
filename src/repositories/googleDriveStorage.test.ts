import { describe, expect, it, vi } from 'vitest'
import { createDemoCompanies } from '../data/demoData'
import { createEmptyAppData, V1_BACKUP_PREFIX } from '../domain/migration'
import type { AppDataV2 } from '../domain/types'
import {
  GoogleDriveRequestError,
  GoogleDriveRestTransport,
  GoogleDriveStorageRepository,
  type DriveFileMetadata,
  type FetchLike,
  type GoogleDriveTransport,
} from './googleDriveStorage'
import { APP_DATA_FILE_NAME, serializeAppDataV2 } from './types'

interface FakeFile {
  metadata: DriveFileMetadata
  raw: string
}

class FakeDriveTransport implements GoogleDriveTransport {
  readonly files = new Map<string, FakeFile>()
  updateCount = 0
  private nextId = 1

  seed(data: AppDataV2, version = '1', id = `file-${this.nextId++}`) {
    const metadata = {
      id,
      name: APP_DATA_FILE_NAME,
      version,
      modifiedTime: data.updatedAt,
    }
    this.files.set(id, { metadata, raw: serializeAppDataV2(data) })
    return id
  }

  mutate(id: string, data: AppDataV2, bumpDriveVersion = true) {
    const file = this.required(id)
    const version = bumpDriveVersion ? String(Number(file.metadata.version) + 1) : file.metadata.version
    this.files.set(id, {
      metadata: { ...file.metadata, version, modifiedTime: data.updatedAt },
      raw: serializeAppDataV2(data),
    })
  }

  async listAppDataFiles(fileName: string) {
    return [...this.files.values()]
      .filter((file) => file.metadata.name === fileName)
      .map((file) => ({ ...file.metadata }))
  }

  async getFileMetadata(fileId: string) {
    return { ...this.required(fileId).metadata }
  }

  async downloadFile(fileId: string) {
    return this.required(fileId).raw
  }

  async createJsonFile(fileName: string, content: string) {
    const id = `file-${this.nextId++}`
    const data = JSON.parse(content) as AppDataV2
    const metadata = { id, name: fileName, version: '1', modifiedTime: data.updatedAt }
    this.files.set(id, { metadata, raw: content })
    return { ...metadata }
  }

  async updateJsonFile(fileId: string, content: string) {
    const file = this.required(fileId)
    const data = JSON.parse(content) as AppDataV2
    const metadata = {
      ...file.metadata,
      version: String(Number(file.metadata.version) + 1),
      modifiedTime: data.updatedAt,
    }
    this.files.set(fileId, { metadata, raw: content })
    this.updateCount += 1
    return { ...metadata }
  }

  private required(fileId: string) {
    const file = this.files.get(fileId)
    if (!file) throw new Error(`missing fake file: ${fileId}`)
    return file
  }
}

const fixedNow = () => '2026-08-21T06:00:00.000Z'

describe('GoogleDriveStorageRepository', () => {
  it('empty remoteへappData JSONを作成し、その後loadできる', async () => {
    const transport = new FakeDriveTransport()
    const repository = new GoogleDriveStorageRepository({ transport, now: fixedNow, legacyBackupStorage: null })

    await expect(repository.exists()).resolves.toBe(false)
    await expect(repository.load()).resolves.toMatchObject({ status: 'empty' })

    const saved = await repository.save(createEmptyAppData('2026-08-21T00:00:00.000Z'))
    expect(saved.status).toBe('saved')
    if (saved.status !== 'saved') throw new Error('expected saved')
    expect(saved.data.revision).toBe(1)
    expect([...transport.files.values()][0].metadata.name).toBe(APP_DATA_FILE_NAME)

    const reader = new GoogleDriveStorageRepository({ transport, now: fixedNow, legacyBackupStorage: null })
    const loaded = await reader.load()
    expect(loaded.status).toBe('loaded')
    if (loaded.status !== 'loaded') throw new Error('expected loaded')
    expect(loaded.data).toEqual(saved.data)
    expect(loaded.version).toMatch(/^gdrive:/)
  })

  it('load時のversion+revisionが一致するときだけ既存remoteを更新する', async () => {
    const transport = new FakeDriveTransport()
    transport.seed(createEmptyAppData('2026-08-21T00:00:00.000Z'), '8')
    const repository = new GoogleDriveStorageRepository({ transport, now: fixedNow, legacyBackupStorage: null })
    const loaded = await repository.load()
    if (loaded.status !== 'loaded') throw new Error('expected loaded')

    const changed = {
      ...loaded.data,
      userSettings: { ...loaded.data.userSettings, includePersonalNotesInAiExport: true },
    }
    const saved = await repository.save(changed, loaded.version)
    expect(saved.status).toBe('saved')
    if (saved.status !== 'saved') throw new Error('expected saved')
    expect(saved.data.revision).toBe(loaded.data.revision + 1)
    expect(transport.updateCount).toBe(1)
  })

  it('v1 importは原文を端末のlegacy backupへ退避してからDriveへcommitする', async () => {
    const transport = new FakeDriveTransport()
    const setItem = vi.fn()
    const repository = new GoogleDriveStorageRepository({
      transport,
      now: fixedNow,
      legacyBackupStorage: { setItem },
    })
    const raw = JSON.stringify(createDemoCompanies().slice(0, 1))

    await expect(repository.load()).resolves.toMatchObject({ status: 'empty' })
    const preview = await repository.importBackup(raw)
    expect(preview.sourceSchemaVersion).toBe(1)
    expect(transport.files.size).toBe(0)

    const committed = await repository.commitImport(preview)
    expect(committed.status).toBe('saved')
    expect(setItem).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^${V1_BACKUP_PREFIX}`)), raw)
    expect(transport.files.size).toBe(1)
  })

  it('Drive versionが同じでもremote revisionが変われば退避JSON付きで停止する', async () => {
    const transport = new FakeDriveTransport()
    const fileId = transport.seed(createEmptyAppData('2026-08-21T00:00:00.000Z'), '8')
    const repository = new GoogleDriveStorageRepository({ transport, now: fixedNow, legacyBackupStorage: null })
    const loaded = await repository.load()
    if (loaded.status !== 'loaded') throw new Error('expected loaded')

    transport.mutate(fileId, { ...loaded.data, revision: loaded.data.revision + 1 }, false)
    const result = await repository.save(loaded.data, loaded.version)

    expect(result.status).toBe('conflict')
    if (result.status !== 'conflict') throw new Error('expected conflict')
    expect(result.conflict.reason).toBe('remote-changed')
    expect(result.conflict.remoteData?.revision).toBe(loaded.data.revision + 1)
    expect(JSON.parse(result.conflict.localBackup?.json ?? '{}').schemaVersion).toBe(2)
    expect(transport.updateCount).toBe(0)
  })

  it('同名remoteが複数なら自動選択しない', async () => {
    const transport = new FakeDriveTransport()
    const data = createEmptyAppData('2026-08-21T00:00:00.000Z')
    transport.seed(data, '1', 'duplicate-a')
    transport.seed(data, '1', 'duplicate-b')
    const repository = new GoogleDriveStorageRepository({ transport, now: fixedNow, legacyBackupStorage: null })

    const loaded = await repository.load()
    expect(loaded.status).toBe('conflict')
    if (loaded.status !== 'conflict') throw new Error('expected conflict')
    expect(loaded.conflict.reason).toBe('multiple-remote-files')
    expect(loaded.conflict.remoteFiles).toHaveLength(2)
  })

  it('既存remoteをloadせずに上書きしない', async () => {
    const transport = new FakeDriveTransport()
    const data = createEmptyAppData('2026-08-21T00:00:00.000Z')
    transport.seed(data)
    const repository = new GoogleDriveStorageRepository({ transport, now: fixedNow, legacyBackupStorage: null })

    const result = await repository.save(data)
    expect(result.status).toBe('conflict')
    if (result.status !== 'conflict') throw new Error('expected conflict')
    expect(result.conflict.reason).toBe('missing-baseline')
    expect(transport.updateCount).toBe(0)
  })
})

function driveError(status: number, reason: string) {
  return new Response(JSON.stringify({
    error: { code: status, message: reason, errors: [{ reason }] },
  }), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('GoogleDriveRestTransport retry', () => {
  it('一時的な403、429、5xxだけを有限backoffして成功する', async () => {
    const responses = [
      driveError(403, 'rateLimitExceeded'),
      driveError(429, 'tooManyRequests'),
      driveError(503, 'backendError'),
      new Response(JSON.stringify({ files: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ]
    const seenHeaders: Array<HeadersInit | undefined> = []
    const fetchImplementation: FetchLike = async (_input, init) => {
      seenHeaders.push(init?.headers)
      return responses.shift() ?? driveError(500, 'unexpected')
    }
    const fetcher = vi.fn(fetchImplementation)
    const delays: number[] = []
    const sleep = vi.fn(async (milliseconds: number) => {
      delays.push(milliseconds)
    })
    const transport = new GoogleDriveRestTransport({
      getAccessToken: () => 'memory-only-token',
      fetch: fetcher,
      sleep,
      random: () => 0,
      maxAttempts: 4,
      baseDelayMs: 10,
    })

    await expect(transport.listAppDataFiles(APP_DATA_FILE_NAME)).resolves.toEqual([])
    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(delays).toEqual([10, 20, 40])
    expect(new Headers(seenHeaders[0]).get('Authorization')).toBe('Bearer memory-only-token')
  })

  it('権限不足403は再試行せずpermanent failureにする', async () => {
    const fetcher = vi.fn<FetchLike>(async () => driveError(403, 'insufficientFilePermissions'))
    const sleep = vi.fn(async () => undefined)
    const transport = new GoogleDriveRestTransport({
      getAccessToken: () => 'memory-only-token',
      fetch: fetcher,
      sleep,
      maxAttempts: 4,
    })

    const error = await transport.listAppDataFiles(APP_DATA_FILE_NAME).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(GoogleDriveRequestError)
    expect((error as GoogleDriveRequestError).attempts).toBe(1)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('一時エラーが続いてもmaxAttemptsで停止する', async () => {
    const fetcher = vi.fn<FetchLike>(async () => driveError(503, 'backendError'))
    const sleep = vi.fn(async () => undefined)
    const transport = new GoogleDriveRestTransport({
      getAccessToken: () => 'memory-only-token',
      fetch: fetcher,
      sleep,
      random: () => 0,
      maxAttempts: 3,
      baseDelayMs: 1,
    })

    const error = await transport.listAppDataFiles(APP_DATA_FILE_NAME).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(GoogleDriveRequestError)
    expect((error as GoogleDriveRequestError).attempts).toBe(3)
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })
})
