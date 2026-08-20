import { test } from '@playwright/test'

test('主要画面をWebアプリ部分だけ撮影する', async ({ page }) => {
  await page.goto('/')
  await page.screenshot({ path: 'docs/evidence/phase-03-first-app/01-dashboard.png', fullPage: true })
  await page.getByRole('button', { name: /企業・選考管理/ }).click()
  await page.screenshot({ path: 'docs/evidence/phase-04-company-management/01-company-list.png', fullPage: true })
  await page.getByRole('heading', { name: '株式会社サンプルテック' }).click()
  await page.screenshot({ path: 'docs/evidence/phase-05-selection-management/01-company-detail.png', fullPage: true })
})

