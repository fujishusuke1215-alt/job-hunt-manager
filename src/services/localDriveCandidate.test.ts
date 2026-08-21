import { describe, expect, it } from 'vitest'
import { createDemoCompanies } from '../data/demoData'
import { createDemoAppData } from '../data/demoDataV2'
import { V1_STORAGE_KEY, V2_STORAGE_KEY } from '../domain/migration'
import {
  driveMigrationMarkerKey,
  inspectLocalDriveCandidate,
  isSameAppData,
  localCandidateFingerprint,
} from './localDriveCandidate'

function storage(values: Record<string, string>): Pick<Storage, 'getItem'> {
  return { getItem: (key) => values[key] ?? null }
}

describe('inspectLocalDriveCandidate', () => {
  it('検証済みv2を優先して候補にする', () => {
    const data = createDemoAppData()
    const result = inspectLocalDriveCandidate(storage({
      [V2_STORAGE_KEY]: JSON.stringify(data),
      [V1_STORAGE_KEY]: JSON.stringify(createDemoCompanies()),
    }))

    expect(result.warning).toBeNull()
    expect(result.candidate).toMatchObject({ source: 'v2', backupKey: null })
    expect(result.candidate?.data.userCompanies).toHaveLength(4)
  })

  it('v1をv2へ移行するが元の文字列は変更しない', () => {
    const raw = JSON.stringify(createDemoCompanies().slice(0, 1))
    const result = inspectLocalDriveCandidate(
      storage({ [V1_STORAGE_KEY]: raw }),
      '2026-08-21T00:00:00.000Z',
    )

    expect(result.candidate?.source).toBe('v1')
    expect(result.candidate?.raw).toBe(raw)
    expect(result.candidate?.backupKey).toContain('legacy-backup:v1')
    expect(result.candidate?.data.userCompanies).toHaveLength(1)
  })

  it('壊れた端末データは候補にせず警告する', () => {
    const result = inspectLocalDriveCandidate(storage({ [V2_STORAGE_KEY]: '{broken' }))
    expect(result.candidate).toBeNull()
    expect(result.warning).toMatch(/自動上書きしていません/)
  })

  it('正規化済みJSONで同一データを判定する', () => {
    const data = createDemoAppData()
    expect(isSameAppData(data, structuredClone(data))).toBe(true)
    expect(isSameAppData(data, { ...data, revision: data.revision + 1 })).toBe(false)
  })

  it('account別の決定markerと端末原文fingerprintを安定生成する', () => {
    const candidate = inspectLocalDriveCandidate(storage({
      [V2_STORAGE_KEY]: JSON.stringify(createDemoAppData()),
    })).candidate!
    expect(localCandidateFingerprint(candidate)).toBe(localCandidateFingerprint(candidate))
    expect(driveMigrationMarkerKey('account-a')).not.toBe(driveMigrationMarkerKey('account-b'))
  })
})
