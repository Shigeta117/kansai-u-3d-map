import { expect, test, type Page } from '@playwright/test';

async function pickPlace(page: Page, role: '出発' | '到着', query: string, name: string) {
  await page.getByRole('button', { name: new RegExp(`^${role}地点を選択`) }).click();
  const picker = page.getByRole('dialog', { name: `${role}地点ピッカー` });
  await picker.getByRole('searchbox').fill(query);
  await picker.getByRole('button', { name: new RegExp(name) }).first().click();
  await expect(picker).toBeHidden();
}

test.describe('案内アプリの代表フロー', () => {
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

  test('検索 → 候補から選ぶと建物のシートが開く', async ({ page }) => {
    const search = page.getByRole('searchbox', { name: '千里山キャンパスを検索' });
    await search.fill('図書館');
    const option = page.getByRole('option', { name: /総合図書館/ }).first();
    await expect(option).toBeVisible();
    await option.click();

    const sheet = page.getByRole('complementary', { name: '建物・施設の詳細情報' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('heading', { name: /総合図書館/ })).toBeVisible();
  });

  test('出入口・連絡のタブは、大学のバリアフリーマップにある連絡通路だけを出す', async ({ page }) => {
    const search = page.getByRole('searchbox', { name: '千里山キャンパスを検索' });
    await search.fill('第1学舎4号館');
    await page.getByRole('option', { name: /第1学舎 4号館/ }).first().click();

    const sheet = page.getByRole('complementary', { name: '建物・施設の詳細情報' });
    await sheet.getByRole('tab', { name: '出入口・連絡' }).click();
    await expect(sheet.getByText('第1学舎 A棟 1階 ↔ D棟 1階 の連絡通路')).toBeVisible();
    await expect(sheet.getByText('途中に階段がある')).toBeVisible();
    await expect(sheet.getByText('第1学舎 D棟 2階 ↔ E棟 1階 の連絡通路')).toBeVisible();
    // 以前の出典の無い連絡（全部「2F」の表記）と出入口が出ていない
    await expect(sheet.getByText(/2F/)).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('access-tab.png') });
  });

  test('中学校・高等学校の施設は、名称と注記だけを出し、経路のボタンを出さない', async ({ page }) => {
    const search = page.getByRole('searchbox', { name: '千里山キャンパスを検索' });
    await search.fill('一高');
    await page.getByRole('option', { name: /関西大学第一高等学校/ }).first().click();

    const sheet = page.getByRole('complementary', { name: '建物・施設の詳細情報' });
    await expect(sheet.getByRole('heading', { name: '関西大学第一高等学校' })).toBeVisible();
    await expect(sheet.getByText('名称だけを表示しています')).toBeVisible();
    await expect(sheet.getByRole('tablist')).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: 'ここへ行く' })).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: 'ここを出発' })).toHaveCount(0);
    await expect(sheet.getByText(/階建相当/)).toHaveCount(0);
  });

  test('経路: 関大前駅 → 総合図書館 を 3 モードで切り替える', async ({ page }) => {
    await page.getByRole('button', { name: 'ルート案内' }).click();
    const panel = page.getByRole('complementary', { name: 'キャンパス内徒歩ルート案内' });
    await expect(panel).toBeVisible();

    await pickPlace(page, '出発', '関大前', '関大前');
    await pickPlace(page, '到着', '総合図書館', '総合図書館');

    const distance = panel.getByTestId('route-distance');
    const minutes = panel.getByTestId('route-minutes');
    await expect(distance).toHaveText(/^\d+m$/);
    await expect(minutes).toHaveText(/^約 \d+分$/);

    const modes = panel.getByRole('radiogroup', { name: 'ルート探索モード' });
    const shortest = modes.getByRole('radio', { name: /最短/ });
    const gentle = modes.getByRole('radio', { name: /坂ひかえめ/ });
    const stepFree = modes.getByRole('radio', { name: /段差フリー/ });
    // 初期モードは「坂ひかえめ」
    await expect(gentle).toBeChecked();
    await expect(panel.getByText('標高データから選んだ参考ルートです。')).toBeVisible();

    await shortest.click();
    await expect(shortest).toBeChecked();
    await expect(panel.getByText('標高データから選んだ参考ルートです。')).toHaveCount(0);
    await expect(distance).toHaveText(/^\d+m$/);

    await stepFree.click();
    await expect(stepFree).toBeChecked();
    await expect(panel.getByText(/参考ルートです。情報の無い段差/)).toBeVisible();
    await expect(panel.getByText('階段・エスカレーターなし（OSM）')).toBeVisible();
    await expect(distance).toHaveText(/^\d+m$/);
    await expect(minutes).toHaveText(/^約 \d+分$/);

    await gentle.click();
    await expect(gentle).toBeChecked();
    await expect(panel.getByText(/情報の無い段差/)).toHaveCount(0);
    await expect(distance).toHaveText(/^\d+m$/);
  });
  test('経路: 第3学舎から関大前駅への下りはエスカレーターの朝の注意が出て、逆の上りだけでは出ない', async ({ page }) => {
    await page.getByRole('button', { name: 'ルート案内' }).click();
    const panel = page.getByRole('complementary', { name: 'キャンパス内徒歩ルート案内' });
    await expect(panel).toBeVisible();
    const note = panel.getByTestId('escalator-rush-note');

    await pickPlace(page, '出発', '第3学舎', '第3学舎');
    await pickPlace(page, '到着', '関大前', '関大前');
    await expect(panel.getByTestId('route-distance')).toHaveText(/^\d+m$/);
    // 既定は畳んだチップだけ。押すと 1 行の説明が出る
    await expect(note).toHaveText(/朝は上りのみ/);
    await expect(note).toHaveAttribute('aria-expanded', 'false');
    await expect(panel.getByText(/8:00〜11:00/)).toHaveCount(0);
    await panel.screenshot({ path: test.info().outputPath('escalator-chip-closed.png') });
    await note.click();
    await expect(note).toHaveAttribute('aria-expanded', 'true');
    await expect(panel.getByText('授業日 8:00〜11:00 は 2 台とも上り。下りは階段です。')).toBeVisible();
    await panel.screenshot({ path: test.info().outputPath('escalator-chip-open.png') });

    // 出発と到着を入れ替えると上りだけになり、注意は出ない
    await panel.getByRole('button', { name: /入れ替え/ }).click();
    await expect(panel.getByText('屋外エスカレーター利用')).toBeVisible();
    await expect(note).toHaveCount(0);

    // 段差フリーはエスカレーターを通さない
    await panel.getByRole('radiogroup', { name: 'ルート探索モード' }).getByRole('radio', { name: /段差フリー/ }).click();
    await expect(panel.getByText('屋外エスカレーター利用')).toHaveCount(0);
    await expect(note).toHaveCount(0);
  });
});
