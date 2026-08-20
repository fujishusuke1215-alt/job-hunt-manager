import { expect, test } from '@playwright/test'

test('公開デモでダッシュボード・検索・企業詳細を確認できる', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '次に動くことが、ひと目で分かる。' })).toBeVisible()
  await page.getByRole('button', { name: /企業・選考管理/ }).click()
  await page.getByPlaceholder('企業名・職種・メモを検索').fill('みらい')
  await expect(page.getByRole('heading', { name: 'みらいデジタル株式会社' })).toBeVisible()
  await page.getByRole('heading', { name: 'みらいデジタル株式会社' }).click()
  await expect(page.getByRole('dialog', { name: 'みらいデジタル株式会社' })).toBeVisible()
})

test('本人用モードで企業CRUDと保存を確認できる', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '本人用' }).click()
  await page.getByRole('button', { name: '＋ 企業を登録' }).click()
  const dialog = page.getByRole('dialog', { name: '新しい企業を登録' })
  await dialog.getByPlaceholder('例: 株式会社サンプルA').fill('株式会社E2Eサンプル')
  await dialog.getByPlaceholder('例: Webエンジニア').fill('テストエンジニア')
  await dialog.getByRole('button', { name: '企業を登録' }).click()
  await expect(page.getByRole('heading', { name: '株式会社E2Eサンプル' })).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: '本人用' }).click()
  await page.getByRole('button', { name: /企業・選考管理/ }).click()
  await expect(page.getByRole('heading', { name: '株式会社E2Eサンプル' })).toBeVisible()
  page.once('dialog', (prompt) => prompt.accept())
  await page.getByRole('button', { name: '削除' }).click()
  await expect(page.getByRole('heading', { name: '株式会社E2Eサンプル' })).not.toBeVisible()
})
