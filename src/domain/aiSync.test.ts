import { describe, expect, it } from 'vitest'
import { createEmptyAppData } from './migration'
import {
  AiSyncValidationError,
  commitAiSyncPreview,
  parseAiSyncEnvelope,
  previewAiSync,
} from './aiSync'
import type { AppDataV2, CatalogData, UserCompany } from './types'

const NOW = '2026-08-21T00:00:00.000Z'

function company(id: string, name = '株式会社架空テック'): UserCompany {
  return {
    id,
    masterCompanyId: 'cmp_fictional_tech',
    userEnteredName: name,
    role: '架空エンジニア',
    applicationCategory: '新卒',
    manualPriority: 'A',
    interest: 4,
    applicationStatus: '検討中',
    myPageStatus: '未開設',
    applicationUrl: '',
    memo: '保持されるメモ',
    watchEnabled: true,
    events: [],
    createdAt: NOW,
    updatedAt: NOW,
  }
}

const catalog: CatalogData = {
  schemaVersion: 1,
  masterCompanies: [
    {
      id: 'cmp_fictional_tech',
      slug: 'fictional-tech',
      legalName: '株式会社架空テック',
      displayName: '架空テック',
      aliases: ['架空テック株式会社'],
      formerNames: [],
      officialDomains: ['fictional.example.com'],
      status: 'active',
      mergedIntoId: null,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
  updatedAt: NOW,
}

function stateWithCompany(): AppDataV2 {
  return { ...createEmptyAppData(NOW), userCompanies: [company('uc_1')] }
}

function factOperation(operationId: string, key = 'eligibility') {
  return {
    operationId,
    entityType: 'researchFact',
    action: 'upsert',
    companyRef: { companyName: '架空テック株式会社' },
    payload: {
      key,
      label: '応募資格',
      value: '応募可',
      recruitingCycle: '架空28卒',
      roleScope: '架空エンジニア',
      checkedAt: NOW,
      verificationLevel: 'official_confirmed',
      reviewStatus: 'draft',
      processedByAi: true,
    },
    evidence: [
      {
        type: 'official_web',
        title: '架空の公式採用ページ',
        url: 'https://fictional.example.com/recruit',
        retrievedAt: NOW,
        publishedAt: null,
        note: 'テスト用の架空情報',
      },
    ],
  }
}

function envelope(operations: unknown[]) {
  return {
    schemaVersion: 1,
    generatedAt: NOW,
    provider: 'manual-ai-test',
    operations,
  }
}

describe('AI Sync validation and transaction flow', () => {
  it('rejects malformed JSON and unsafe URL schemes', () => {
    expect(() => parseAiSyncEnvelope('{broken')).toThrow(AiSyncValidationError)

    const unsafe = factOperation('op_unsafe')
    unsafe.evidence[0].url = 'javascript:alert(1)'
    expect(() => parseAiSyncEnvelope(envelope([unsafe]))).toThrow(AiSyncValidationError)
  })

  it('previews without mutating state and commits only selected operations', () => {
    const original = stateWithCompany()
    const snapshot = structuredClone(original)
    const input = envelope([
      factOperation('op_fact_selected', 'eligibility'),
      factOperation('op_fact_unselected', 'web_test'),
    ])

    const preview = previewAiSync(input, original, catalog)

    expect(original).toEqual(snapshot)
    expect(preview.items.map((item) => item.status)).toEqual(['ready', 'ready'])
    expect(preview.items[0].changes.some((change) => change.field === 'value')).toBe(true)

    const result = commitAiSyncPreview(original, preview, ['op_fact_selected'], { now: NOW })

    expect(original).toEqual(snapshot)
    expect(result.data).not.toBe(original)
    expect(result.data.researchFacts).toHaveLength(1)
    expect(result.data.researchFacts[0]).toMatchObject({
      userCompanyId: 'uc_1',
      key: 'eligibility',
      verificationLevel: 'official_confirmed',
      processedByAi: true,
    })
    expect(result.data.researchFacts[0].sources[0].type).toBe('official_web')
    expect(result.data.processedOperationIds).toContain('op_fact_selected')
    expect(result.data.processedOperationIds).not.toContain('op_fact_unselected')
  })

  it('upserts selection events and Watch Findings, then ignores processed operationIds', () => {
    const original = stateWithCompany()
    const input = envelope([
      {
        operationId: 'op_event_1',
        entityType: 'selectionEvent',
        action: 'upsert',
        companyRef: { masterCompanyId: 'cmp_fictional_tech' },
        payload: {
          type: '面接',
          title: '架空一次面接',
          scheduledAt: '2026-08-22T03:00:00.000Z',
          status: '予定',
          location: 'オンライン',
          memo: '',
        },
        evidence: [],
      },
      {
        operationId: 'op_watch_1',
        entityType: 'watchFinding',
        action: 'upsert',
        companyRef: { officialDomain: 'fictional.example.com' },
        payload: {
          type: 'application_deadline',
          severity: 'high',
          title: '架空応募締切',
          summary: '架空の応募締切が公開されました。',
          detectedAt: NOW,
          deadline: '2026-08-24T00:00:00.000Z',
          status: 'new',
          fingerprint: 'fictional-deadline-2026-08-24',
        },
        evidence: [],
      },
    ])
    const preview = previewAiSync(input, original, catalog)
    const committed = commitAiSyncPreview(
      original,
      preview,
      ['op_event_1', 'op_watch_1'],
      { now: NOW },
    ).data

    expect(committed.userCompanies[0].events).toHaveLength(1)
    expect(committed.watchFindings).toHaveLength(1)
    expect(committed.watchFindings[0].fingerprint).toBe('fictional-deadline-2026-08-24')

    const duplicatePreview = previewAiSync(input, committed, catalog)
    expect(duplicatePreview.items.every((item) => item.status === 'duplicate')).toBe(true)
    const duplicateCommit = commitAiSyncPreview(
      committed,
      duplicatePreview,
      ['op_event_1', 'op_watch_1'],
      { now: '2026-08-21T01:00:00.000Z' },
    )
    expect(duplicateCommit.data).toBe(committed)
    expect(duplicateCommit.data.userCompanies[0].events).toHaveLength(1)
    expect(duplicateCommit.data.watchFindings).toHaveLength(1)
  })

  it('marks multiple normalized company candidates as blocked', () => {
    const original = stateWithCompany()
    original.userCompanies = [
      { ...company('uc_1'), masterCompanyId: null, userEnteredName: '株式会社 同名商事' },
      { ...company('uc_2'), masterCompanyId: null, userEnteredName: '同名商事株式会社' },
    ]
    const operation = factOperation('op_ambiguous')
    operation.companyRef.companyName = '同名商事'

    const preview = previewAiSync(envelope([operation]), original, catalog)

    expect(preview.items[0].status).toBe('blocked')
    expect(preview.items[0].companyMatch.status).toBe('ambiguous')
    expect(preview.items[0].companyMatch.candidateUserCompanyIds).toEqual(['uc_1', 'uc_2'])
  })

  it('never applies delete without additional confirmation', () => {
    const original = stateWithCompany()
    original.researchFacts = [
      {
        id: 'fact_to_delete',
        userCompanyId: 'uc_1',
        masterCompanyId: 'cmp_fictional_tech',
        key: 'web_test',
        label: 'Webテスト',
        value: '要確認',
        recruitingCycle: null,
        roleScope: null,
        checkedAt: null,
        verificationLevel: 'unverified',
        reviewStatus: 'draft',
        processedByAi: false,
        sources: [],
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]
    const input = envelope([
      {
        operationId: 'op_delete_fact',
        entityType: 'researchFact',
        action: 'delete',
        companyRef: { masterCompanyId: 'cmp_fictional_tech' },
        payload: { id: 'fact_to_delete' },
        evidence: [],
      },
    ])
    const preview = previewAiSync(input, original, catalog)

    expect(preview.items[0]).toMatchObject({ status: 'ready', requiresDeleteConfirmation: true })
    const unconfirmed = commitAiSyncPreview(original, preview, ['op_delete_fact'], { now: NOW })
    expect(unconfirmed.data).toBe(original)
    expect(unconfirmed.deleteConfirmationRequiredIds).toEqual(['op_delete_fact'])

    const confirmed = commitAiSyncPreview(original, preview, ['op_delete_fact'], {
      now: NOW,
      confirmedDeleteOperationIds: ['op_delete_fact'],
    })
    expect(confirmed.data.researchFacts).toHaveLength(0)
    expect(confirmed.appliedOperationIds).toEqual(['op_delete_fact'])
  })

  it('applies the first occurrence of a duplicated operationId only once', () => {
    const original = stateWithCompany()
    const input = envelope([
      factOperation('op_same', 'eligibility'),
      factOperation('op_same', 'eligibility'),
    ])
    const preview = previewAiSync(input, original, catalog)

    expect(preview.items.map((item) => item.status)).toEqual(['ready', 'duplicate'])
    const result = commitAiSyncPreview(original, preview, ['op_same'], { now: NOW })
    expect(result.data.researchFacts).toHaveLength(1)
    expect(result.data.processedOperationIds.filter((id) => id === 'op_same')).toHaveLength(1)
  })
})
