import { test } from '@playwright/test'

const watchEnvelope = JSON.stringify({
  schemaVersion: 1,
  generatedAt: '2026-08-21T00:00:00.000Z',
  provider: 'portfolio-manual-ai',
  operations: [{
    operationId: 'op_portfolio_watch_1',
    entityType: 'watchFinding',
    action: 'upsert',
    companyRef: { masterCompanyId: 'cmp_demo_sample_tech_01' },
    payload: {
      type: 'application_deadline', severity: 'high', title: '架空サンプル応募締切',
      summary: '架空の採用ページで締切変更を検知した想定です。',
      detectedAt: '2026-08-21T00:00:00.000Z', deadline: '2026-08-23T00:00:00.000Z',
      status: 'new', fingerprint: 'portfolio-fictional-deadline-20260823',
    },
    evidence: [{
      type: 'official_web', title: '架空の公式採用ページ',
      url: 'https://sample-tech.example.com/recruit', retrievedAt: '2026-08-21T00:00:00.000Z',
      publishedAt: null, note: 'ポートフォリオ用の架空出典',
    }],
  }],
})

test('Phase 20の主要画面をWebアプリ部分だけ撮影する', async ({ page }) => {
  await page.goto('/')
  await page.screenshot({ path: 'docs/evidence/phase-20-ux-selection-generalization/screenshots/01-home.png', fullPage: true })

  await page.getByRole('button', { name: '企業・選考' }).click()
  await page.screenshot({ path: 'docs/evidence/phase-20-ux-selection-generalization/screenshots/02-company-list.png', fullPage: true })
  await page.getByRole('button', { name: '＋ 企業を登録' }).click()
  await page.getByPlaceholder('例: 株式会社サンプルテック').fill('サンプルテック株式会社')
  await page.screenshot({ path: 'docs/evidence/phase-20-ux-selection-generalization/screenshots/03-company-form.png', fullPage: true })
  await page.getByRole('button', { name: '閉じる' }).click()

  await page.getByRole('button', { name: '評価設定' }).click()
  await page.screenshot({ path: 'docs/evidence/phase-20-ux-selection-generalization/screenshots/04-scoring-settings.png', fullPage: true })

  await page.getByRole('button', { name: 'AIから取り込む' }).click()
  await page.getByLabel('JSONを貼り付け').fill(watchEnvelope)
  await page.getByRole('button', { name: '検証して差分を見る' }).click()
  await page.screenshot({ path: 'docs/evidence/phase-20-ux-selection-generalization/screenshots/05-ai-import.png', fullPage: true })
  await page.getByRole('button', { name: /選択した 1件を反映/ }).click()
  await page.getByRole('button', { name: '更新・通知' }).click()
  await page.screenshot({ path: 'docs/evidence/phase-20-ux-selection-generalization/screenshots/06-updates.png', fullPage: true })

  await page.getByRole('button', { name: '本人用' }).click()
  await page.getByText('保存先は空です。最初の保存で新規作成します。').waitFor()
  await page.screenshot({ path: 'docs/evidence/phase-20-ux-selection-generalization/screenshots/07-local-personal.png', fullPage: true })
})

test('Phase 20のモバイル画面をWebアプリ部分だけ撮影する', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.screenshot({ path: 'docs/evidence/phase-20-ux-selection-generalization/screenshots/08-mobile-home.png', fullPage: true })
})
