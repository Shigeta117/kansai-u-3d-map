import { expect, test, type Page } from '@playwright/test';

// 誠之館の建て替えの範囲（public/data/senriyama/closures.json。確認は 2026-11-24）
async function pickPlace(page: Page, role: '出発' | '到着', query: string, name: RegExp) {
  await page.getByRole('button', { name: new RegExp(`^${role}地点を選択`) }).click();
  const picker = page.getByRole('dialog', { name: `${role}地点ピッカー` });
  await picker.getByRole('searchbox').fill(query);
  await picker.getByRole('button', { name }).first().click();
  await expect(picker).toBeHidden();
}

async function openSheet(page: Page, query: string, option: RegExp) {
  await page.getByRole('searchbox', { name: '千里山キャンパスを検索' }).fill(query);
  await page.getByRole('option', { name: option }).first().click();
  const sheet = page.getByRole('complementary', { name: '建物・施設の詳細情報' });
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe('誠之館の建て替えの範囲', () => {
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

  test('範囲の中の建物は「建て替え工事中」と出し、経路のボタンを押せない', async ({ page }) => {
    const sheet = await openSheet(page, '誠之館2号館', /誠之館2号館/);
    await expect(sheet.getByTestId('construction-note')).toHaveText('建て替え工事中（2026 年 11 月時点）');
    await expect(sheet.getByRole('button', { name: 'ここへ行く' })).toBeDisabled();
    await expect(sheet.getByRole('button', { name: 'ここを出発' })).toBeDisabled();
    await expect(sheet.getByText('工事の囲いの中のため、経路は引けません')).toBeVisible();
  });

  test('悠久の庭は一部だけが囲いの中で、行き先にできる', async ({ page }) => {
    const sheet = await openSheet(page, '悠久の庭', /悠久の庭/);
    await expect(sheet.getByTestId('construction-note')).toHaveText('一部が工事の囲いの中（2026 年 11 月時点）');
    await expect(sheet.getByRole('button', { name: 'ここへ行く' })).toBeEnabled();
  });

  test('経路: 尚文館 → KUシンフォニーホール と 簡文館 → 有鄰館 は範囲を避けて引ける', async ({ page }) => {
    await page.getByRole('button', { name: 'ルート案内' }).click();
    const panel = page.getByRole('complementary', { name: 'キャンパス内徒歩ルート案内' });
    await expect(panel).toBeVisible();
    const distance = panel.getByTestId('route-distance');

    await pickPlace(page, '出発', '尚文館', /^尚文館\s*共用/);
    await pickPlace(page, '到着', 'シンフォニー', /^誠之館 4号館/);
    await expect(distance).toHaveText(/^\d+m$/);

    await pickPlace(page, '出発', '簡文館', /^簡文館/);
    await pickPlace(page, '到着', '誠之館6号館', /^誠之館6号館 有鄰館/);
    await expect(distance).toHaveText(/^\d+m$/);
    // 封鎖された簡文館→有鄰館の階段（約 139m）を通らず、尚文館の外周と新館側の通路を回る
    const meters = Number((await distance.textContent())?.replace('m', ''));
    expect(meters).toBeGreaterThan(160);
  });
});
