import { defineConfig } from '@playwright/test';

// 3240〜3246 は手元の開発サーバーが使うので、E2E 専用に 3252 を使う。
// 別の作業が同時に E2E を動かすときは E2E_PORT で空いているポートに変える（例: E2E_PORT=3255 npm run test:e2e）
const PORT = Number(process.env.E2E_PORT ?? 3252);

// CI（GitHub Actions の ubuntu）には手元の Chrome が無い。CI では Playwright が入れる Chromium を使い、
// GPU が無いので WebGL はソフトウェア描画（SwiftShader）に回す。手元（CI 未設定）の挙動は変えない。
const IS_CI = !!process.env.CI;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // CI は GPU 無し（SwiftShader）と Vite の初回起動で最初の描画が遅いので、待ちを長くする
  timeout: IS_CI ? 120_000 : 60_000,
  expect: { timeout: IS_CI ? 45_000 : 15_000 },
  reporter: IS_CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...(IS_CI ? {} : { channel: 'chrome' as const }),
    headless: true,
    launchOptions: IS_CI
      ? { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }
      : {},
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
