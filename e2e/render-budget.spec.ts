import { expect, test, type Page } from '@playwright/test';

// 描画命令の予算（docs/quality-plan.md 4 節: 全景で 150 回以下）。建物をまたいでまとめたメッシュ（staticBatches.ts）は
// shader を書き換えるので、選択・時間帯の切り替え（影の地図の描き直し）でも shader のエラーが出ないことを確かめる
const CALL_BUDGET = 150;

async function renderStats(page: Page): Promise<{ calls: number; shadowCalls: number; renders: number }> {
  return page.evaluate(() => ({
    calls: Number(document.body.dataset.kumCalls ?? -1),
    shadowCalls: Number(document.body.dataset.kumShadowCalls ?? -1),
    renders: Number(document.body.dataset.kumRenders ?? 0),
  }));
}

async function waitForNextRender(page: Page, after: number): Promise<void> {
  await page.waitForFunction((n) => Number(document.body.dataset.kumRenders ?? 0) > n, after);
}

test.describe('描画の重さ', () => {
  const consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0;
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));
  });

  test.afterEach(() => {
    expect(consoleErrors).toEqual([]);
  });

  test('全景の描画命令と影の描画命令が予算に収まり、選択と時間帯の切り替えでも収まる', async ({ page }) => {
    await page.goto('/?stats=1');
    await expect(page.locator('canvas')).toBeVisible();
    await page.waitForFunction(() => Number(document.body.dataset.kumRenders ?? 0) >= 1);

    const overview = await renderStats(page);
    expect(overview.calls).toBeGreaterThan(0);
    expect(overview.calls).toBeLessThanOrEqual(CALL_BUDGET);
    expect(overview.shadowCalls).toBeGreaterThan(0);
    expect(overview.shadowCalls).toBeLessThanOrEqual(CALL_BUDGET);

    // 建物を選ぶ（浮かせた建物は元のメッシュで描くので、その分だけ増える）
    await page.getByRole('searchbox', { name: '千里山キャンパスを検索' }).fill('凜風館');
    await page.getByRole('option').first().click();
    await expect(page.getByRole('complementary', { name: '建物・施設の詳細情報' })).toBeVisible();
    await waitForNextRender(page, overview.renders);
    const selected = await renderStats(page);
    expect(selected.calls).toBeLessThanOrEqual(CALL_BUDGET);

    // 時間帯を切り替えると影の地図を描き直す（選んで浮かせた建物の影も描く）
    await page.getByRole('button', { name: 'メニューを開く' }).click();
    await page.getByRole('radio', { name: '夕方' }).click();
    await waitForNextRender(page, selected.renders);
    const golden = await renderStats(page);
    expect(golden.shadowCalls).toBeGreaterThan(0);
    expect(golden.shadowCalls).toBeLessThanOrEqual(CALL_BUDGET);
  });
});
