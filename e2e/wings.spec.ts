import { expect, test } from '@playwright/test';

// 建物の中の棟（第3学舎の A〜D棟）を検索で選ぶ。地図を押して棟を選ぶ流れは WebGL のクリックが揺れるので、
// 当たり判定は Vitest（packages/core/src/scene/wingSelection.test.ts）で確かめる
test.describe('第3学舎の棟を選ぶ', () => {
  const consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0;
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
  });

  test.afterEach(() => {
    expect(consoleErrors).toEqual([]);
  });

  test('「C棟」で検索 → シートに棟の名前と C棟の部屋だけが出て、建物全体にも戻せる', async ({ page }) => {
    const search = page.getByRole('searchbox', { name: '千里山キャンパスを検索' });
    await search.fill('C棟');
    // ほかの学舎の C棟の部屋より上に、第3学舎の C棟が出る
    const first = page.getByRole('option').first();
    await expect(first).toContainText('第3学舎 3号館 C棟');
    await first.click();

    const sheet = page.getByRole('complementary', { name: '建物・施設の詳細情報' });
    await expect(sheet.getByRole('heading', { name: '第3学舎 3号館 C棟' })).toBeVisible();
    await expect(sheet.getByRole('tab', { name: 'フロア・教室' })).toHaveAttribute('aria-selected', 'true');
    await expect(sheet.getByRole('button', { name: '3号館 C棟', pressed: true })).toBeVisible();
    await expect(sheet.getByText('C301〜C304', { exact: true })).toBeVisible();
    await expect(sheet.getByText('C501・C502・C505', { exact: true })).toBeVisible();
    for (const other of ['A101', 'B201〜B207', 'D301・D302']) {
      await expect(sheet.getByText(other, { exact: true })).toHaveCount(0);
    }
    // 階のボタンは C棟の階だけ（地階は A棟だけ）
    await expect(sheet.getByRole('button', { name: /^B1F/ })).toHaveCount(0);

    // 建物全体に戻すと、全部の棟の部屋が出る
    await sheet.getByRole('button', { name: '建物全体を見る' }).click();
    await expect(sheet.getByRole('heading', { name: '第3学舎（社会学部・ソシオAV大ホール）' })).toBeVisible();
    await expect(sheet.getByText('A101', { exact: true })).toBeVisible();
    await expect(sheet.getByText('C301〜C304', { exact: true })).toBeVisible();

    // 棟のボタンで選び直すと、見出しも替わる
    await sheet.getByRole('button', { name: '4号館 D棟' }).click();
    await expect(sheet.getByRole('heading', { name: '第3学舎 4号館 D棟' })).toBeVisible();
    await expect(sheet.getByText('D301・D302', { exact: true })).toBeVisible();
    await expect(sheet.getByText('C301〜C304', { exact: true })).toHaveCount(0);

    // 「ここへ行く」は建物（第3学舎）の入口への経路のまま
    await sheet.getByRole('button', { name: 'ここへ行く' }).click();
    await expect(page.getByRole('button', { name: /^到着地点を選択: 第3学舎（社会学部/ })).toBeVisible();
  });

  test('部屋の番号（C301）で検索 → C棟を選んだ状態で 3 階の部屋が出る', async ({ page }) => {
    const search = page.getByRole('searchbox', { name: '千里山キャンパスを検索' });
    await search.fill('C301');
    await page.getByRole('option', { name: /第3学舎3号館 C301/ }).first().click();

    const sheet = page.getByRole('complementary', { name: '建物・施設の詳細情報' });
    await expect(sheet.getByRole('heading', { name: '第3学舎 3号館 C棟' })).toBeVisible();
    await expect(sheet.getByText('C301〜C304', { exact: true })).toBeVisible();
    await expect(sheet.getByText('C401〜C404', { exact: true })).toHaveCount(0);
  });
});

// 第4学舎2号館の研究棟は部外者・学部生が入れないので、館内の情報を載せない（docs/indoor-plan.md 3 節、持ち主の決め 2026-11-24）
test.describe('第4学舎2号館の研究棟', () => {
  const consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0;
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
  });

  test.afterEach(() => {
    expect(consoleErrors).toEqual([]);
  });

  test('研究棟の部屋は検索にも建物シートにも出ない（教室棟と研究棟別館の部屋は出る）', async ({ page }) => {
    const search = page.getByRole('searchbox', { name: '千里山キャンパスを検索' });
    // 前に載っていた研究棟の部屋の名前で探しても、どこにも当たらない
    await search.fill('高磁場NMR室');
    await expect(page.getByText('一致する建物・教室が見つかりません')).toBeVisible();
    await expect(page.getByRole('option')).toHaveCount(0);

    await search.fill('第4学舎2号館');
    await page.getByRole('option', { name: /第4学舎 ?2号館/ }).first().click();
    const sheet = page.getByRole('complementary', { name: '建物・施設の詳細情報' });
    await expect(sheet.getByRole('heading', { name: '第4学舎 2号館' })).toBeVisible();
    await sheet.getByRole('tab', { name: 'フロア・教室' }).click();
    await expect(sheet.getByText('2101〜2106／4ST', { exact: true })).toBeVisible();
    await expect(sheet.getByText('B1F〜1F 物理実験場', { exact: true })).toBeVisible();
    await expect(sheet.getByRole('button', { name: '③2号館（教室棟）' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: /研究棟）$/ })).toHaveCount(0);
    await expect(sheet.getByText(/高磁場NMR室|建築設計製図室/)).toHaveCount(0);
  });
});
