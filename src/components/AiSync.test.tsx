import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createEmptyAppData } from '../domain/migration'
import type { AppDataV2, CatalogData, UserCompany } from '../domain/types'
import { AiSync } from './AiSync'

const NOW = '2026-08-21T00:00:00.000Z'

const fictionalCompany: UserCompany = {
  id: 'user_company_fictional',
  masterCompanyId: 'cmp_fictional_labs',
  userEnteredName: '架空ラボ株式会社',
  role: '架空開発職',
  applicationCategory: '新卒',
  manualPriority: 'A',
  interest: 4,
  applicationStatus: '検討中',
  myPageStatus: '未開設',
  applicationUrl: '',
  memo: '完全な架空データ',
  watchEnabled: true,
  events: [],
  createdAt: NOW,
  updatedAt: NOW,
}

const catalog: CatalogData = {
  schemaVersion: 1,
  masterCompanies: [
    {
      id: 'cmp_fictional_labs',
      slug: 'fictional-labs',
      legalName: '架空ラボ株式会社',
      displayName: '架空ラボ',
      aliases: ['株式会社架空ラボ'],
      formerNames: [],
      officialDomains: ['fictional-labs.example.com'],
      status: 'active',
      mergedIntoId: null,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
  updatedAt: NOW,
}

function appData(): AppDataV2 {
  return { ...createEmptyAppData(NOW), userCompanies: [fictionalCompany] }
}

function validEnvelope() {
  const operation = (operationId: string, key: string, label: string, value: string) => ({
    operationId,
    entityType: 'researchFact',
    action: 'upsert',
    companyRef: { masterCompanyId: 'cmp_fictional_labs' },
    payload: {
      key,
      label,
      value,
      recruitingCycle: '架空28卒',
      roleScope: '架空開発職',
      checkedAt: NOW,
      verificationLevel: 'official_confirmed',
      reviewStatus: 'draft',
      processedByAi: true,
    },
    evidence: [
      {
        type: 'official_web',
        title: '架空ラボ公式採用ページ',
        url: 'https://fictional-labs.example.com/recruit',
        retrievedAt: NOW,
        publishedAt: null,
        note: 'テスト専用の架空情報',
      },
    ],
  })

  return {
    schemaVersion: 1,
    generatedAt: NOW,
    provider: 'fictional-manual-ai',
    operations: [
      operation('op_fictional_eligibility', 'eligibility', '応募資格', '応募可'),
      operation('op_fictional_web_test', 'web_test', 'Webテスト', '架空テスト方式'),
    ],
  }
}

describe('AiSync', () => {
  it('valid payloadの差分を表示し、個別選択した候補だけを承認後に反映する', async () => {
    const user = userEvent.setup()
    const data = appData()
    const snapshot = structuredClone(data)
    const onChange = vi.fn()
    render(<AiSync data={data} catalog={catalog} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('JSONを貼り付け'), {
      target: { value: JSON.stringify(validEnvelope()) },
    })
    await user.click(screen.getByRole('button', { name: '検証して差分を見る' }))

    expect(screen.getByRole('status')).toHaveTextContent('反映可能 2件')
    expect(screen.getByRole('status')).toHaveTextContent('まだ本データは変更していません')
    expect(screen.getByRole('heading', { name: '応募資格' })).toBeInTheDocument()
    expect(screen.getByText('応募可')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Webテスト' })).toBeInTheDocument()
    expect(data).toEqual(snapshot)
    expect(onChange).not.toHaveBeenCalled()

    const webTestCard = screen.getByRole('heading', { name: 'Webテスト' }).closest('article')
    expect(webTestCard).not.toBeNull()
    const webTestCheckbox = within(webTestCard!).getByRole('checkbox')
    expect(webTestCheckbox).toBeChecked()
    await user.click(webTestCheckbox)
    expect(webTestCheckbox).not.toBeChecked()

    await user.click(screen.getByRole('button', { name: '選択した 1件を反映' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    const changed = onChange.mock.calls[0][0] as AppDataV2
    expect(changed).not.toBe(data)
    expect(changed.researchFacts).toHaveLength(1)
    expect(changed.researchFacts[0]).toMatchObject({
      userCompanyId: fictionalCompany.id,
      key: 'eligibility',
      value: '応募可',
    })
    expect(changed.processedOperationIds).toEqual(['op_fictional_eligibility'])
    expect(data).toEqual(snapshot)
  })

  it('invalid JSONを拒否して既存stateとonChangeを変更しない', async () => {
    const user = userEvent.setup()
    const data = appData()
    const snapshot = structuredClone(data)
    const onChange = vi.fn()
    render(<AiSync data={data} catalog={catalog} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('JSONを貼り付け'), {
      target: { value: '{ invalid json' },
    })
    await user.click(screen.getByRole('button', { name: '検証して差分を見る' }))

    expect(screen.getByRole('status')).toHaveTextContent('AI Sync JSONを解析できません')
    expect(screen.queryByText('DIFF PREVIEW')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    expect(data).toEqual(snapshot)
  })
})
