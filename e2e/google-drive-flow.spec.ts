import { expect, test, type Page, type Route } from '@playwright/test'
import { createEmptyAppData } from '../src/domain/migration'
import type { AppDataV2 } from '../src/domain/types'

interface MockRemote {
  fileId: string
  version: number
  data: AppDataV2
}

function tokenFrom(route: Route): 'token-a' | 'token-b' {
  const header = route.request().headers().authorization ?? ''
  if (header === 'Bearer token-a') return 'token-a'
  if (header === 'Bearer token-b') return 'token-b'
  throw new Error(`Unexpected Authorization header: ${header}`)
}

async function installGoogleMocks(page: Page) {
  const remotes: Record<'token-a' | 'token-b', MockRemote> = {
    'token-a': { fileId: 'file-a', version: 1, data: createEmptyAppData('2026-08-21T00:00:00.000Z') },
    'token-b': { fileId: 'file-b', version: 1, data: createEmptyAppData('2026-08-21T00:00:00.000Z') },
  }

  await page.addInitScript(() => {
    let accountIndex = 0
    const accounts = [
      { token: 'token-a', scope: 'openid email profile https://www.googleapis.com/auth/drive.appdata' },
      { token: 'token-b', scope: 'openid email profile https://www.googleapis.com/auth/drive.appdata' },
    ]
    Object.defineProperty(globalThis, 'google', {
      configurable: true,
      value: {
        accounts: {
          oauth2: {
            initTokenClient: (options: { callback: (response: object) => void }) => ({
              requestAccessToken: () => {
                const account = accounts[Math.min(accountIndex, accounts.length - 1)]
                accountIndex += 1
                options.callback({ access_token: account.token, expires_in: 3600, scope: account.scope })
              },
            }),
            revoke: (_token: string, callback: (response: object) => void) => callback({}),
          },
        },
      },
    })
  })

  await page.route('https://openidconnect.googleapis.com/v1/userinfo', async (route) => {
    const token = tokenFrom(route)
    const suffix = token === 'token-a' ? 'a' : 'b'
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ sub: `account-${suffix}`, email: `${suffix}@example.com`, name: `架空ユーザー${suffix.toUpperCase()}` }),
    })
  })

  await page.route('https://www.googleapis.com/**', async (route) => {
    const token = tokenFrom(route)
    const remote = remotes[token]
    const request = route.request()
    const url = new URL(request.url())
    const metadata = () => ({
      id: remote.fileId,
      name: 'job-hunt-manager-data-v2.json',
      version: String(remote.version),
      modifiedTime: remote.data.updatedAt,
    })

    if (request.method() === 'GET' && url.pathname === '/drive/v3/files') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ files: [metadata()] }) })
      return
    }
    if (request.method() === 'GET' && url.pathname === `/drive/v3/files/${remote.fileId}`) {
      if (url.searchParams.get('alt') === 'media') {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(remote.data) })
      } else {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(metadata()) })
      }
      return
    }
    if (request.method() === 'PATCH' && url.pathname === `/upload/drive/v3/files/${remote.fileId}`) {
      remote.data = JSON.parse(request.postData() ?? '{}') as AppDataV2
      remote.version += 1
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(metadata()) })
      return
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'unexpected mock route' }) })
  })

  return remotes
}

test('Demo→Google A→Drive保存→logout→Google Bで個人データを分離する', async ({ page }) => {
  const remotes = await installGoogleMocks(page)
  await page.goto('/')

  await expect(page.getByRole('heading', { name: '就活の情報を、次の行動へ。' })).toBeVisible()
  await page.screenshot({
    path: 'docs/evidence/phase-20-ux-selection-generalization/screenshots/09-google-entry.png',
    fullPage: true,
  })
  await page.getByRole('button', { name: 'デモを見る' }).click()
  await expect(page.getByRole('heading', { name: '次に動くことが、ひと目で分かる。' })).toBeVisible()
  await page.getByRole('button', { name: '本人用' }).click()
  await page.getByRole('button', { name: 'Googleでログインして読み込む' }).click()
  await expect(page.getByLabel(/Google接続済み a@example.com/)).toBeVisible()
  await page.screenshot({
    path: 'docs/evidence/phase-20-ux-selection-generalization/screenshots/10-google-personal-mock.png',
    fullPage: true,
  })

  await page.getByRole('button', { name: '＋ 企業を登録' }).click()
  const dialog = page.getByRole('dialog', { name: '新しい企業を登録' })
  await dialog.getByPlaceholder('例: 株式会社サンプルテック').fill('株式会社架空A専用')
  await dialog.getByPlaceholder('例: Webエンジニア').fill('架空開発職')
  await dialog.getByRole('button', { name: '企業を登録' }).click()
  await expect.poll(() => remotes['token-a'].data.userCompanies.some((company) => company.userEnteredName === '株式会社架空A専用')).toBe(true)

  await page.getByRole('button', { name: 'ログアウト' }).click()
  await expect(page.getByRole('heading', { name: '就活の情報を、次の行動へ。' })).toBeVisible()
  await page.getByRole('button', { name: 'Googleアカウントで利用する' }).click()
  await expect(page.getByLabel(/Google接続済み b@example.com/)).toBeVisible()
  await expect(page.getByText('株式会社架空A専用')).not.toBeVisible()
  expect(remotes['token-b'].data.userCompanies).toHaveLength(0)
})
