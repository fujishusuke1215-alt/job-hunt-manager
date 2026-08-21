import { describe, expect, it } from 'vitest'
import { createDemoCompanies } from '../data/demoData'
import { createEmptyAppData } from '../domain/migration'
import {
  createConflictBackup,
  createImportPreview,
  serializeAppDataV2,
  StorageRepositoryError,
} from './types'

describe('storage import preview', () => {
  it('v2を検証し、commit前のpreviewだけを返す', () => {
    const data = createEmptyAppData('2026-08-21T00:00:00.000Z')
    const preview = createImportPreview(serializeAppDataV2(data), '2026-08-21T01:00:00.000Z')

    expect(preview.sourceSchemaVersion).toBe(2)
    expect(preview.data).toEqual(data)
    expect(preview.requiresConfirmation).toBe(true)
    expect(preview.legacyBackup).toBeNull()
  })

  it('v1を移行previewへ変換し、原文のlegacy backup情報を保持する', () => {
    const raw = JSON.stringify(createDemoCompanies().slice(0, 1))
    const preview = createImportPreview(raw, '2026-08-21T01:00:00.000Z')

    expect(preview.sourceSchemaVersion).toBe(1)
    expect(preview.data.userCompanies).toHaveLength(1)
    expect(preview.data.userCompanies[0].id).toBe(createDemoCompanies()[0].id)
    expect(preview.legacyBackup?.raw).toBe(raw)
    expect(preview.data.researchFacts.every((fact) => fact.verificationLevel === 'unverified')).toBe(true)
  })

  it('malformedまたは未対応schemaを拒否する', () => {
    expect(() => createImportPreview('{broken')).toThrow(StorageRepositoryError)
    expect(() => createImportPreview('{"schemaVersion":99}')).toThrow('対応していない')
  })

  it('競合退避JSONにtoken等の保存層情報を混ぜない', () => {
    const data = createEmptyAppData('2026-08-21T00:00:00.000Z')
    const backup = createConflictBackup(data, '2026-08-21T01:02:03.000Z')

    expect(JSON.parse(backup.json)).toEqual(data)
    expect(backup.fileName).toBe('job-hunt-manager-conflict-2026-08-21T01-02-03-000Z.json')
    expect(backup.json).not.toContain('access_token')
  })
})
