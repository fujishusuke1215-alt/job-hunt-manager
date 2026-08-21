import { expect, test } from '@playwright/test'

test('公開デモでダッシュボード・検索・企業詳細・選考予定を確認できる', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '次に動くことが、ひと目で分かる。' })).toBeVisible()
  await page.getByRole('button', { name: /企業・選考管理/ }).click()
  await page.getByPlaceholder('企業名・職種・メモ・調査情報を検索').fill('みらい')
  await expect(page.getByRole('heading', { name: 'みらいデジタル' })).toBeVisible()
  await page.getByRole('heading', { name: 'みらいデジタル' }).click()
  const detail = page.getByRole('dialog', { name: 'みらいデジタル' })
  await expect(detail).toBeVisible()
  await detail.getByPlaceholder('例: 一次面接').fill('架空の最終面接')
  await detail.getByLabel('日時 必須').fill('2026-09-10T10:00')
  await detail.getByRole('button', { name: '予定を追加' }).click()
  await expect(detail.getByRole('heading', { name: '架空の最終面接' })).toBeVisible()
})

test('ローカル開発の本人用モードで企業CRUDとv2保存を確認できる', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '本人用' }).click()
  await expect(page.getByText('ローカル開発モード', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('保存先は空です。最初の保存で新規作成します。')).toBeVisible()
  await page.getByRole('button', { name: '＋ 企業を登録' }).click()
  const dialog = page.getByRole('dialog', { name: '新しい企業を登録' })
  await dialog.getByPlaceholder('例: 株式会社サンプルテック').fill('株式会社E2Eサンプル')
  await dialog.getByPlaceholder('例: Webエンジニア').fill('テストエンジニア')
  await dialog.getByRole('button', { name: '企業を登録' }).click()
  await expect(page.getByRole('heading', { name: '株式会社E2Eサンプル' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('job-hunt-manager:app-data:v2'))).toContain('株式会社E2Eサンプル')

  await page.reload()
  await page.getByRole('button', { name: '本人用' }).click()
  await page.getByRole('button', { name: /企業・選考管理/ }).click()
  await expect(page.getByRole('heading', { name: '株式会社E2Eサンプル' })).toBeVisible()
  page.once('dialog', (prompt) => prompt.accept())
  await page.getByRole('button', { name: '削除' }).click()
  await expect(page.getByRole('heading', { name: '株式会社E2Eサンプル' })).not.toBeVisible()
})

test('評価プロファイルを複製・変更し、ランキングを再計算できる', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '評価設定' }).click()
  await page.getByPlaceholder('例: エンジニア就活用').fill('E2E評価プロファイル')
  await page.getByRole('button', { name: '現在設定を複製' }).click()
  await expect(page.getByLabel('Active profile')).toHaveValue(/profile_/)
  const firstCriterion = page.locator('.criterion-card').first()
  await firstCriterion.getByLabel('項目名').fill('E2E給与評価')
  await firstCriterion.getByLabel('weight').fill('30')
  await page.getByRole('button', { name: '評価設定を保存' }).click()
  await expect(page.getByText('評価設定を保存し、ランキングを再計算しました。')).toBeVisible()
  await page.getByRole('button', { name: 'ダッシュボード' }).click()
  await expect(page.getByRole('heading', { name: '企業適合度' })).toBeVisible()
})

test('AI Syncは差分承認後だけWatchへ反映する', async ({ page }) => {
  const envelope = {
    schemaVersion: 1,
    generatedAt: '2026-08-21T00:00:00.000Z',
    provider: 'e2e-manual-ai',
    operations: [{
      operationId: 'op_e2e_watch_1',
      entityType: 'watchFinding',
      action: 'upsert',
      companyRef: { masterCompanyId: 'cmp_demo_sample_tech_01' },
      payload: {
        type: 'application_deadline',
        severity: 'high',
        title: '架空E2E応募締切',
        summary: '完全な架空情報です。',
        detectedAt: '2026-08-21T00:00:00.000Z',
        deadline: '2026-08-23T00:00:00.000Z',
        status: 'new',
        fingerprint: 'e2e-fictional-deadline-20260823',
      },
      evidence: [{
        type: 'official_web',
        title: '架空の公式ページ',
        url: 'https://sample-tech.example.com/recruit',
        retrievedAt: '2026-08-21T00:00:00.000Z',
        publishedAt: null,
        note: 'E2E用架空出典',
      }],
    }],
  }
  await page.goto('/')
  await page.getByRole('button', { name: 'AI同期' }).click()
  await page.getByLabel('JSONを貼り付け').fill(JSON.stringify(envelope))
  await page.getByRole('button', { name: '検証して差分を見る' }).click()
  await expect(page.getByRole('heading', { name: '架空E2E応募締切' })).toBeVisible()
  await page.getByRole('button', { name: /選択した 1件を反映/ }).click()
  await expect(page.getByText('1件を反映しました。0件はスキップしました。')).toBeVisible()
  await page.getByRole('button', { name: 'Watch' }).click()
  await expect(page.getByRole('heading', { name: '架空E2E応募締切' })).toBeVisible()
})

test('v1 localStorageを原文保持しながらv2へ移行する', async ({ page }) => {
  const now = '2026-08-21T00:00:00.000Z'
  const legacy = [{
    id: 'legacy-e2e-company',
    name: '株式会社架空レガシー',
    role: '架空開発職',
    applicationCategory: '架空新卒',
    priority: 'B',
    interest: 4,
    status: '検討中',
    graduateEligibility: '要確認',
    existingGraduateEligibility: '要確認',
    workExperienceEligibility: '要確認',
    webTest: '要確認',
    codingTest: '要確認',
    myPageStatus: '未開設',
    applicationUrl: '',
    memo: '架空の移行メモ',
    scores: { salary: 3, benefits: 3, wlb: 4, remote: 4, flex: 4, overseas: 2, itFit: 4 },
    events: [],
    createdAt: now,
    updatedAt: now,
  }]
  await page.addInitScript((value) => localStorage.setItem('job-hunt-manager:personal-companies:v1', JSON.stringify(value)), legacy)
  await page.goto('/')
  await page.getByRole('button', { name: '本人用' }).click()
  await expect(page.getByText(/v1原文は退避し、旧キーも保持/)).toBeVisible()
  await page.getByRole('button', { name: /企業・選考管理/ }).click()
  await expect(page.getByRole('heading', { name: '株式会社架空レガシー' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('job-hunt-manager:personal-companies:v1'))).toContain('株式会社架空レガシー')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('job-hunt-manager:app-data:v2'))).toContain('"schemaVersion": 2')
})

test('v2 JSONバックアップをダウンロードできる', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'データ管理' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'JSONを書き出す' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toContain('job-hunt-manager-backup-v2-')
})
