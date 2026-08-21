import { describe, expect, it } from 'vitest'
import { createDemoCompanies } from '../data/demoData'
import { createEmptyAppData } from './migration'
import { createAiAnalysisExport, createV2Backup, previewBackupImport } from './backup'

describe('v2 backup', () => {
  it('v2を検証してpreviewしてから読み込める', () => {
    const data = createEmptyAppData('2026-08-21T00:00:00.000Z')
    const preview = previewBackupImport(createV2Backup(data), '2026-08-21T00:00:00.000Z')
    expect(preview.sourceVersion).toBe(2)
    expect(preview.data).toEqual(data)
  })

  it('v1 backupをmigrationしてpreviewする', () => {
    const raw = JSON.stringify({ schemaVersion: 1, exportedAt: '2026-08-21T00:00:00.000Z', companies: createDemoCompanies().slice(0, 1) })
    const preview = previewBackupImport(raw, '2026-08-21T00:00:00.000Z')
    expect(preview.sourceVersion).toBe(1)
    expect(preview.data.userCompanies).toHaveLength(1)
  })

  it('invalid JSONでは既存値を受け取らず例外にする', () => {
    expect(() => previewBackupImport('{broken')).toThrow('現在データは変更していません')
  })

  it('AI分析用exportは既定で個人メモを含めない', () => {
    const data = createEmptyAppData('2026-08-21T00:00:00.000Z')
    data.userCompanies = [{
      id: 'company-1', masterCompanyId: null, userEnteredName: '架空会社', role: '', applicationCategory: '',
      manualPriority: 'B', interest: 3, applicationStatus: '検討中', myPageStatus: '未開設', applicationUrl: '',
      memo: '個人的なメモ', watchEnabled: true, events: [], createdAt: data.updatedAt, updatedAt: data.updatedAt,
    }]
    expect(createAiAnalysisExport(data)).not.toContain('個人的なメモ')
    expect(createAiAnalysisExport(data, true)).toContain('個人的なメモ')
  })
})

