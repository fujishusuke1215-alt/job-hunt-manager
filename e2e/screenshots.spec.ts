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

test('v2主要画面をWebアプリ部分だけ新Phaseへ撮影する', async ({ page }) => {
  await page.goto('/')
  await page.screenshot({ path: 'docs/evidence/phase-17-v2-release/screenshots/01-v2-dashboard.png', fullPage: true })
  await page.screenshot({ path: 'docs/portfolio/screenshots/v2-dashboard.png', fullPage: true })

  await page.getByRole('button', { name: /企業・選考管理/ }).click()
  await page.screenshot({ path: 'docs/evidence/phase-17-v2-release/screenshots/02-v2-company-list.png', fullPage: true })
  await page.getByRole('button', { name: '＋ 企業を登録' }).click()
  await page.getByPlaceholder('例: 株式会社サンプルテック').fill('サンプルテック株式会社')
  await page.screenshot({ path: 'docs/evidence/phase-13-company-master/screenshots/01-master-candidate.png', fullPage: true })
  await page.getByRole('button', { name: '閉じる' }).click()

  await page.getByRole('button', { name: '評価設定' }).click()
  await page.screenshot({ path: 'docs/evidence/phase-12-configurable-scoring/screenshots/01-scoring-settings.png', fullPage: true })
  await page.screenshot({ path: 'docs/portfolio/screenshots/v2-scoring.png', fullPage: true })

  await page.getByRole('button', { name: 'AI同期' }).click()
  await page.getByLabel('JSONを貼り付け').fill(watchEnvelope)
  await page.getByRole('button', { name: '検証して差分を見る' }).click()
  await page.screenshot({ path: 'docs/evidence/phase-14-ai-sync-watch/screenshots/01-ai-diff-preview.png', fullPage: true })
  await page.screenshot({ path: 'docs/portfolio/screenshots/v2-ai-sync.png', fullPage: true })
  await page.getByRole('button', { name: /選択した 1件を反映/ }).click()
  await page.getByRole('button', { name: 'Watch' }).click()
  await page.screenshot({ path: 'docs/evidence/phase-14-ai-sync-watch/screenshots/02-watch-center.png', fullPage: true })
  await page.screenshot({ path: 'docs/portfolio/screenshots/v2-watch.png', fullPage: true })

  await page.getByRole('button', { name: '本人用' }).click()
  await page.getByText('保存先は空です。最初の保存で新規作成します。').waitFor()
  await page.screenshot({ path: 'docs/evidence/phase-15-google-drive/screenshots/01-local-development-mode.png', fullPage: true })
})

test('v2モバイル画面をWebアプリ部分だけ撮影する', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.screenshot({ path: 'docs/evidence/phase-17-v2-release/screenshots/03-v2-mobile-dashboard.png', fullPage: true })
  await page.screenshot({ path: 'docs/portfolio/screenshots/v2-mobile-dashboard.png', fullPage: true })
})
