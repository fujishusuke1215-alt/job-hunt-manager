import { describe, expect, it } from 'vitest'
import { createDemoCompanies } from '../data/demoData'
import { createBackup, loadPersonalCompanies, parseBackup, savePersonalCompanies, STORAGE_KEY } from './storage'

describe('personal storage', () => {
  it('企業データを保存して読み戻せる', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }
    const companies = createDemoCompanies().slice(0, 1)
    savePersonalCompanies(companies, storage)

    expect(values.has(STORAGE_KEY)).toBe(true)
    expect(loadPersonalCompanies(storage)).toEqual(companies)
  })

  it('壊れたJSONでは空配列を返し既存処理を止めない', () => {
    expect(loadPersonalCompanies({ getItem: () => '{broken' })).toEqual([])
  })
})

describe('backup', () => {
  it('書き出したバックアップを検証して読み戻せる', () => {
    const backup = createBackup(createDemoCompanies(), new Date('2026-08-20T00:00:00.000Z'))
    expect(parseBackup(JSON.stringify(backup))).toEqual(backup)
  })

  it('未対応形式を拒否する', () => {
    expect(() => parseBackup('{"schemaVersion":2,"companies":[]}')).toThrow('対応していない')
  })
})

