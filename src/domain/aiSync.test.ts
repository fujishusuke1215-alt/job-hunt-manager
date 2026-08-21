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
    expect(committed.watchRuns).toHaveLength(1)
    expect(committed.watchRuns[0]).toMatchObject({
      provider: 'manual-ai-test',
      findingCount: 1,
      status: 'completed',
    })
    expect(committed.watchFindings[0].watchRunId).toBe(committed.watchRuns[0].id)

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

  it('deduplicates different Watch operationIds with the same fingerprint within one run', () => {
    const original = stateWithCompany()
    const watchOperation = (operationId: string, summary: string) => ({
      operationId,
      entityType: 'watchFinding',
      action: 'upsert',
      companyRef: { masterCompanyId: 'cmp_fictional_tech' },
      payload: {
        type: 'recruitment_info_changed',
        severity: 'medium',
        title: '架空募集要項の更新',
        summary,
        detectedAt: NOW,
        deadline: null,
        status: 'new',
        fingerprint: 'fictional-shared-fingerprint',
      },
      evidence: [],
    })
    const input = envelope([
      watchOperation('op_watch_same_fp_1', '架空の初回情報です。'),
      watchOperation('op_watch_same_fp_2', '架空の更新情報です。'),
    ])
    const preview = previewAiSync(input, original, catalog)
    const committed = commitAiSyncPreview(
      original,
      preview,
      ['op_watch_same_fp_1', 'op_watch_same_fp_2'],
      { now: NOW },
    ).data

    expect(committed.watchFindings).toHaveLength(1)
    expect(committed.watchFindings[0].summary).toBe('架空の更新情報です。')
    expect(committed.watchRuns).toHaveLength(1)
    expect(committed.watchRuns[0].findingCount).toBe(1)
    expect(committed.processedOperationIds).toEqual(
      expect.arrayContaining(['op_watch_same_fp_1', 'op_watch_same_fp_2']),
    )
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

  it('uses operation-order virtual state for a new company and its dependent entities', () => {
    const original = createEmptyAppData(NOW)
    const input = envelope([
      {
        operationId: 'op_create_custom_company',
        entityType: 'userCompany',
        action: 'upsert',
        companyRef: { companyName: '株式会社架空新規ラボ' },
        payload: {
          id: 'uc_new_fictional',
          userEnteredName: '株式会社架空新規ラボ',
          role: '架空研究職',
        },
        evidence: [],
      },
      {
        ...factOperation('op_new_company_fact', 'web_test'),
        companyRef: { companyName: '架空新規ラボ' },
      },
      {
        operationId: 'op_new_company_event',
        entityType: 'selectionEvent',
        action: 'upsert',
        companyRef: { companyName: '架空新規ラボ' },
        payload: {
          type: '面接',
          title: '架空一次面接',
          scheduledAt: '2026-08-23T03:00:00.000Z',
          status: '予定',
          location: '架空オンライン会場',
          memo: '',
        },
        evidence: [],
      },
      {
        operationId: 'op_new_company_watch',
        entityType: 'watchFinding',
        action: 'upsert',
        companyRef: { companyName: '架空新規ラボ' },
        payload: {
          type: 'recruitment_started',
          severity: 'medium',
          title: '架空採用開始',
          summary: '完全な架空情報です。',
          detectedAt: NOW,
          deadline: null,
          status: 'new',
          fingerprint: 'fictional-new-company-watch',
        },
        evidence: [],
      },
    ])

    const preview = previewAiSync(input, original, catalog)
    expect(preview.items.map((item) => item.status)).toEqual(['ready', 'ready', 'ready', 'ready'])
    expect(original.userCompanies).toHaveLength(0)

    const committed = commitAiSyncPreview(
      original,
      preview,
      preview.items.map((item) => item.operation.operationId),
      { now: '2026-08-21T01:00:00.000Z' },
    ).data

    expect(committed.userCompanies).toHaveLength(1)
    expect(committed.userCompanies[0].id).toBe('uc_new_fictional')
    expect(committed.researchFacts[0].userCompanyId).toBe('uc_new_fictional')
    expect(committed.userCompanies[0].events).toHaveLength(1)
    expect(committed.watchFindings[0].userCompanyId).toBe('uc_new_fictional')
    expect(committed.watchFindings[0].watchRunId).toBe(committed.watchRuns[0].id)
  })

  it('blocks an orphan-producing upsert after an earlier company delete', () => {
    const original = stateWithCompany()
    const deleteCompany = {
      operationId: 'op_delete_company_first',
      entityType: 'userCompany',
      action: 'delete',
      companyRef: { masterCompanyId: 'cmp_fictional_tech' },
      payload: { id: 'uc_1' },
      evidence: [],
    }
    const input = envelope([deleteCompany, factOperation('op_fact_after_company_delete')])
    const preview = previewAiSync(input, original, catalog)

    expect(preview.items.map((item) => item.status)).toEqual(['ready', 'blocked'])
    const committed = commitAiSyncPreview(
      original,
      preview,
      ['op_delete_company_first', 'op_fact_after_company_delete'],
      { now: NOW, confirmedDeleteOperationIds: ['op_delete_company_first'] },
    ).data
    expect(committed.userCompanies).toHaveLength(0)
    expect(committed.researchFacts).toHaveLength(0)
  })

  it('rejects a selected dependent operation when its preceding company creation is not selected', () => {
    const original = createEmptyAppData(NOW)
    const snapshot = structuredClone(original)
    const input = envelope([
      {
        operationId: 'op_dependency_company',
        entityType: 'userCompany',
        action: 'upsert',
        companyRef: { companyName: '株式会社架空依存テック' },
        payload: { id: 'uc_dependency', userEnteredName: '株式会社架空依存テック' },
        evidence: [],
      },
      {
        ...factOperation('op_dependency_fact'),
        companyRef: { companyName: '架空依存テック' },
      },
    ])
    const preview = previewAiSync(input, original, catalog)

    expect(preview.items.map((item) => item.status)).toEqual(['ready', 'ready'])
    expect(() => commitAiSyncPreview(original, preview, ['op_dependency_fact'], { now: NOW }))
      .toThrow('元データを変更していません')
    expect(original).toEqual(snapshot)
  })

  it('rescales existing evaluations when an AI profile upsert changes scaleMax with the same criterion ID', () => {
    const original = stateWithCompany()
    const profile = original.scoringProfiles.find((item) => item.id === original.activeScoringProfileId)!
    const criterion = profile.criteria[0]
    original.evaluations = [{
      id: 'evaluation_fictional',
      userCompanyId: 'uc_1',
      scoringProfileId: profile.id,
      values: { [criterion.id]: 4 },
      createdAt: NOW,
      updatedAt: NOW,
    }]
    const operation = {
      operationId: 'op_profile_scale_change',
      entityType: 'scoringProfile',
      action: 'upsert',
      payload: {
        id: profile.id,
        name: profile.name,
        kind: profile.kind,
        criteria: profile.criteria.map((item) =>
          item.id === criterion.id ? { ...item, scaleMax: 10 } : item,
        ),
      },
      evidence: [],
    }

    const preview = previewAiSync(envelope([operation]), original, catalog)
    expect(preview.items[0].status).toBe('ready')
    const committed = commitAiSyncPreview(original, preview, ['op_profile_scale_change'], { now: NOW }).data
    expect(original.evaluations[0].values[criterion.id]).toBe(4)
    expect(committed.evaluations[0].values[criterion.id]).toBe(8)
  })

  it('blocks AI profile updates that discard an existing criterion ID', () => {
    const original = stateWithCompany()
    const profile = original.scoringProfiles.find((item) => item.id === original.activeScoringProfileId)!
    const operation = {
      operationId: 'op_profile_remove_criterion',
      entityType: 'scoringProfile',
      action: 'upsert',
      payload: {
        id: profile.id,
        name: profile.name,
        kind: profile.kind,
        criteria: profile.criteria.slice(1),
      },
      evidence: [],
    }

    const preview = previewAiSync(envelope([operation]), original, catalog)
    expect(preview.items[0]).toMatchObject({ status: 'blocked', canApply: false })
    expect(preview.items[0].message).toContain('評価項目ID')
  })
})
