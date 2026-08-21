import { describe, expect, it } from 'vitest'
import { createDemoCompanies } from '../data/demoData'
import { createEmptyAppData, V1_BACKUP_PREFIX, V1_STORAGE_KEY, V2_STORAGE_KEY } from '../domain/migration'
import { LocalDevelopmentStorageRepository, type LocalStorageAdapter } from './localDevelopmentStorage'

class MapStorage implements LocalStorageAdapter {
  readonly values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }
}

const now = () => '2026-08-21T03:00:00.000Z'

describe('LocalDevelopmentStorageRepository', () => {
  it('空の保存先を判定し、v2を保存・読込できる', async () => {
    const storage = new MapStorage()
    const repository = new LocalDevelopmentStorageRepository({ storage, now })

    await expect(repository.exists()).resolves.toBe(false)
    await expect(repository.load()).resolves.toMatchObject({ status: 'empty' })

    const saved = await repository.save(createEmptyAppData('2026-08-21T00:00:00.000Z'))
    expect(saved.status).toBe('saved')
    if (saved.status !== 'saved') throw new Error('expected saved')
    expect(saved.data.revision).toBe(1)
    expect(storage.getItem(V2_STORAGE_KEY)).not.toBeNull()

    const anotherRepository = new LocalDevelopmentStorageRepository({ storage, now })
    const loaded = await anotherRepository.load()
    expect(loaded.status).toBe('loaded')
    if (loaded.status !== 'loaded') throw new Error('expected loaded')
    expect(loaded.data).toEqual(saved.data)
  })

  it('v1原文を先に退避し、ID等を保持してv2へ移行する', async () => {
    const storage = new MapStorage()
    const legacy = createDemoCompanies().slice(0, 1)
    const raw = JSON.stringify(legacy)
    storage.setItem(V1_STORAGE_KEY, raw)
    const repository = new LocalDevelopmentStorageRepository({ storage, now })

    const loaded = await repository.load()
    expect(loaded.status).toBe('loaded')
    if (loaded.status !== 'loaded') throw new Error('expected loaded')
    expect(loaded.migratedFromV1).toBe(true)
    expect(loaded.data.userCompanies[0].id).toBe(legacy[0].id)
    expect(loaded.data.userCompanies[0].memo).toBe(legacy[0].memo)
    expect(loaded.data.userCompanies[0].events).toEqual(legacy[0].events)
    expect(storage.getItem(V1_STORAGE_KEY)).toBe(raw)
    expect(loaded.legacyBackup?.raw).toBe(raw)
    expect(storage.getItem(loaded.legacyBackup?.key ?? '')).toBe(raw)
  })

  it('不正なv1はv2へ書かず、原文の退避だけを残す', async () => {
    const storage = new MapStorage()
    storage.setItem(V1_STORAGE_KEY, '{broken')
    const repository = new LocalDevelopmentStorageRepository({ storage, now })

    await expect(repository.load()).rejects.toThrow('v1データ')
    expect(storage.getItem(V2_STORAGE_KEY)).toBeNull()
    expect(storage.getItem(V1_STORAGE_KEY)).toBe('{broken')
    const backupKeys = [...storage.values.keys()].filter((key) => key.startsWith(V1_BACKUP_PREFIX))
    expect(backupKeys).toHaveLength(1)
    expect(storage.getItem(backupKeys[0])).toBe('{broken')
  })

  it('別インスタンスの更新を検知し、JSON退避情報付きで上書きを止める', async () => {
    const storage = new MapStorage()
    const seedRepository = new LocalDevelopmentStorageRepository({ storage, now })
    await seedRepository.load()
    await seedRepository.save(createEmptyAppData('2026-08-21T00:00:00.000Z'))

    const first = new LocalDevelopmentStorageRepository({ storage, now })
    const second = new LocalDevelopmentStorageRepository({ storage, now })
    const firstLoad = await first.load()
    const secondLoad = await second.load()
    if (firstLoad.status !== 'loaded' || secondLoad.status !== 'loaded') throw new Error('expected loaded')

    const firstData = { ...firstLoad.data, userSettings: { ...firstLoad.data.userSettings, includePersonalNotesInAiExport: true } }
    expect((await first.save(firstData, firstLoad.version)).status).toBe('saved')

    const result = await second.save(secondLoad.data, secondLoad.version)
    expect(result.status).toBe('conflict')
    if (result.status !== 'conflict') throw new Error('expected conflict')
    expect(result.conflict.reason).toBe('local-changed')
    expect(result.conflict.localBackup?.json).toContain('"schemaVersion": 2')
  })

  it('invalid importは現在データを変更せず、valid importもpreview時点では変更しない', async () => {
    const storage = new MapStorage()
    const repository = new LocalDevelopmentStorageRepository({ storage, now })
    await repository.load()
    const initial = await repository.save(createEmptyAppData('2026-08-21T00:00:00.000Z'))
    if (initial.status !== 'saved') throw new Error('expected saved')
    const before = storage.getItem(V2_STORAGE_KEY)

    await expect(repository.importBackup('{broken')).rejects.toThrow()
    expect(storage.getItem(V2_STORAGE_KEY)).toBe(before)

    const preview = await repository.importBackup(JSON.stringify(createDemoCompanies().slice(0, 1)))
    expect(preview.sourceSchemaVersion).toBe(1)
    expect(storage.getItem(V2_STORAGE_KEY)).toBe(before)

    const committed = await repository.commitImport(preview, initial.version)
    expect(committed.status).toBe('saved')
    if (committed.status !== 'saved') throw new Error('expected saved')
    expect(committed.data.userCompanies).toHaveLength(1)
  })
})
