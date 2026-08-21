import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/google-drive-flow.spec.ts',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    channel: 'msedge',
    viewport: { width: 320, height: 800 },
    locale: 'ja-JP',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev --configLoader runner --mode e2e-google --host 127.0.0.1 --port 4174',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: true,
  },
})
