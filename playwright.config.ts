import { defineConfig } from '@playwright/test';

// 3240〜3246 は手元の開発サーバーが使うので、E2E 専用に 3252 を使う。
// 別の作業が同時に E2E を動かすときは E2E_PORT で空いているポートに変える（例: E2E_PORT=3255 npm run test:e2e）
const PORT = Number(process.env.E2E_PORT ?? 3252);

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'chrome',
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm -w apps/guide run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
