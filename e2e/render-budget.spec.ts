import { expect, test, type Page } from '@playwright/test';

// 描画命令の予算（docs/quality-plan.md 4 節: 全景で 150 回以下）。建物をまたいでまとめたメッシュ（staticBatches.ts）は
// shader を書き換えるので、選択・時間帯の切り替え（影の地図の描き直し）でも shader のエラーが出ないことを確かめる
const CALL_BUDGET = 150;
// 持ち上げずに選んだときに増えてよい描画命令（殻の塗り＋輪郭の 2 回。selectionHighlight.ts）
const SELECTION_EXTRA_CALLS = 3;

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

/** 描画が止まる（カメラが着く）まで待ってから数える */
async function settledStats(page: Page): Promise<{ calls: number; shadowCalls: number; renders: number }> {
  let last = await renderStats(page);
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(250);
    const now = await renderStats(page);
    if (now.renders === last.renders) return now;
    last = now;
  }
  return last;
}

/** 検索で選んで、選んだ状態と、同じ視点で選びをやめた状態の描画命令を数える */
async function selectedAndUnselected(page: Page, query: string, option: RegExp): Promise<{ selected: number; unselected: number }> {
  await page.getByRole('searchbox', { name: '千里山キャンパスを検索' }).fill(query);
  await page.getByRole('option', { name: option }).first().click();
  const sheet = page.getByRole('complementary', { name: '建物・施設の詳細情報' });
  await expect(sheet).toBeVisible();
  const selected = await settledStats(page);
  await sheet.getByRole('button', { name: '詳細パネルを閉じる' }).click();
  await expect(sheet).toBeHidden();
  await waitForNextRender(page, selected.renders);
  const unselected = await settledStats(page);
  return { selected: selected.calls, unselected: unselected.calls };
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

    // 建物を選ぶ（既定は持ち上げないので、殻の塗りと輪郭の分だけ増える）
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

  test('持ち上げずに選ぶと、選んだ分の描画命令は殻の塗りと輪郭の分だけ（建物全体・棟）', async ({ page }) => {
    // カメラを飛ばさずに着かせる（同じ視点で選んだ状態と選んでいない状態を比べる）
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?stats=1');
    await expect(page.locator('canvas')).toBeVisible();
    await page.waitForFunction(() => Number(document.body.dataset.kumRenders ?? 0) >= 1);

    for (const [query, option] of [
      ['第3学舎', /第3学舎（社会学部/],
      ['C棟', /第3学舎 3号館 C棟/],
      ['総合図書館', /総合図書館/],
    ] as const) {
      const { selected, unselected } = await selectedAndUnselected(page, query, option);
      expect(selected, query).toBeLessThanOrEqual(CALL_BUDGET);
      expect(selected - unselected, query).toBeGreaterThan(0);
      expect(selected - unselected, query).toBeLessThanOrEqual(SELECTION_EXTRA_CALLS);
    }
  });

  test('持ち上げる案（sel=outline,fill,lift）でも予算に収まる', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?stats=1&sel=outline,fill,lift');
    await expect(page.locator('canvas')).toBeVisible();
    await page.waitForFunction(() => Number(document.body.dataset.kumRenders ?? 0) >= 1);
    const { selected, unselected } = await selectedAndUnselected(page, '第3学舎', /第3学舎（社会学部/);
    expect(selected).toBeLessThanOrEqual(CALL_BUDGET);
    // 持ち上げた建物は元のメッシュで描くので、その建物の分だけ増える
    expect(selected - unselected).toBeGreaterThan(SELECTION_EXTRA_CALLS);
  });
});
