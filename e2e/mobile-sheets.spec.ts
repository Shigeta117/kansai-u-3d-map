import { devices, expect, test, type Locator, type Page } from '@playwright/test';

// iPhone 15 相当の幅・タッチ。devices の defaultBrowserType（webkit）は使わず、設定どおりシステムの Chrome で動かす
test.use({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: devices['iPhone 15'].userAgent,
});

interface Point {
  x: number;
  y: number;
}

/**
 * 指のドラッグを CDP のタッチで再現する（touch-action・touchmove の preventDefault・ネイティブのスクロールが本物どおりに効く）。
 * holdMs: 離す前に指を止めておく時間（払わずにゆっくり置く）
 */
async function touchDrag(page: Page, from: Point, to: Point, opts: { steps?: number; stepMs?: number; holdMs?: number } = {}) {
  const { steps = 12, stepMs = 16, holdMs = 0 } = opts;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  for (let i = 1; i <= steps; i++) {
    await page.waitForTimeout(stepMs);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }],
    });
  }
  if (holdMs > 0) await page.waitForTimeout(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

async function centerOf(locator: Locator): Promise<Point> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('要素が画面に無い');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function pickPlace(page: Page, role: '出発' | '到着', query: string, name: string) {
  await page.getByRole('button', { name: new RegExp(`^${role}地点を選択`) }).click();
  const picker = page.getByRole('dialog', { name: `${role}地点ピッカー` });
  await picker.getByRole('searchbox').fill(query);
  await picker.getByRole('button', { name: new RegExp(name) }).first().click();
  await expect(picker).toBeHidden();
}

test.describe('スマホの下から出るシート', () => {
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

  test('建物シート: つまみで段が変わり、つまみを下へ払うと閉じる', async ({ page }) => {
    const search = page.getByRole('searchbox', { name: '千里山キャンパスを検索' });
    await search.fill('第3学舎');
    await page.getByRole('option', { name: /第3学舎/ }).first().click();

    const sheet = page.getByRole('complementary', { name: '建物・施設の詳細情報' });
    await expect(sheet).toHaveAttribute('data-snap', 'half');
    // 固定されるのは建物名と下のボタン。タブは中身の側にある
    await expect(sheet.getByRole('heading', { name: /第3学舎/ })).toBeInViewport();
    await expect(sheet.getByRole('button', { name: 'ここへ行く' })).toBeInViewport();

    const handle = sheet.getByRole('button', { name: /シートの高さを変える/ });
    await handle.tap();
    await expect(sheet).toHaveAttribute('data-snap', 'full');
    await sheet.getByRole('tab', { name: 'フロア・教室' }).tap();
    // 高い段では教室の一覧まで見える
    await expect(sheet.getByPlaceholder(/教室番号・オフィス名で絞り込み/)).toBeInViewport();

    const start = await centerOf(handle);
    await touchDrag(page, start, { x: start.x, y: start.y + 600 }, { steps: 8, stepMs: 12 });
    await expect(sheet).toBeHidden();
  });

  test('建物シート: 中身が一番上なら下へ引くとシートが下がり、低い段からさらに引くと閉じる', async ({ page }) => {
    const search = page.getByRole('searchbox', { name: '千里山キャンパスを検索' });
    await search.fill('総合図書館');
    await page.getByRole('option', { name: /総合図書館/ }).first().click();

    const sheet = page.getByRole('complementary', { name: '建物・施設の詳細情報' });
    await expect(sheet).toHaveAttribute('data-snap', 'half');

    // 中身（説明文）を指で下へゆっくり引く → 低い段
    const body = sheet.getByRole('tablist', { name: '建物詳細タブ' });
    const from = await centerOf(body);
    await touchDrag(page, from, { x: from.x, y: from.y + 260 }, { steps: 20, stepMs: 16, holdMs: 150 });
    await expect(sheet).toHaveAttribute('data-snap', 'peek');
    await expect(sheet.getByRole('button', { name: 'ここへ行く' })).toBeInViewport();
    await expect(body).not.toBeInViewport();

    // 低い段のつまみをさらに下へゆっくり引いて離す → 閉じる
    const handle = sheet.getByRole('button', { name: /シートの高さを変える/ });
    const h = await centerOf(handle);
    await touchDrag(page, h, { x: h.x, y: h.y + 120 }, { steps: 12, stepMs: 16, holdMs: 150 });
    await expect(sheet).toBeHidden();
  });

  test('ルート: 経路が出ると低い段の要約になり、上へドラッグすると設定が見える', async ({ page }) => {
    await page.getByRole('button', { name: 'ルート案内' }).tap();
    const panel = page.getByRole('complementary', { name: 'キャンパス内徒歩ルート案内' });
    await expect(panel).toHaveAttribute('data-snap', 'half');

    // 候補の一覧を開くと高い段に上がる（出発は既定の関大前駅のままなので経路は変わらない）
    await pickPlace(page, '出発', '関大前', '関大前');
    await expect(panel).toHaveAttribute('data-snap', 'full');
    await pickPlace(page, '到着', '総合図書館', '総合図書館');

    // 経路が出たら低い段: 出発 → 到着・時間・距離・モードの要約だけ
    await expect(panel).toHaveAttribute('data-snap', 'peek');
    const summary = panel.getByRole('button', { name: /関大前駅から/ });
    await expect(summary).toContainText('関大前駅');
    await expect(summary).toContainText('総合図書館');
    await expect(summary).toContainText(/約 \d+分/);
    await expect(summary).toContainText('坂ひかえめ');
    const modes = panel.getByRole('radiogroup', { name: 'ルート探索モード' });
    await expect(modes).not.toBeInViewport();
    const box = await panel.boundingBox();
    expect(box?.height ?? 999).toBeLessThan(160);

    // 地図を指で動かしても設定は消えない
    await touchDrag(page, { x: 200, y: 300 }, { x: 120, y: 420 }, { steps: 10, stepMs: 16, holdMs: 50 });
    await expect(panel).toHaveAttribute('data-snap', 'peek');
    await expect(summary).toContainText('総合図書館');

    // つまみを上へゆっくりドラッグ → 中の段で出発地・行き先・モードを変えられる
    const handle = panel.getByRole('button', { name: /シートの高さを変える/ });
    const h = await centerOf(handle);
    await touchDrag(page, h, { x: h.x, y: h.y - 330 }, { steps: 20, stepMs: 16, holdMs: 150 });
    await expect(panel).toHaveAttribute('data-snap', 'half');
    await expect(modes).toBeInViewport();
    await expect(page.getByRole('button', { name: /^到着地点を選択: 総合図書館/ })).toBeInViewport();

    // 見出しを押すと地図（低い段）と設定（中の段）を行き来する
    await summary.tap();
    await expect(panel).toHaveAttribute('data-snap', 'peek');
    await summary.tap();
    await expect(panel).toHaveAttribute('data-snap', 'half');

    // モードを替えると、経路が変わったので低い段に戻り、要約のモード名も変わる
    await modes.getByRole('radio', { name: /最短/ }).tap();
    await expect(panel).toHaveAttribute('data-snap', 'peek');
    await expect(summary).toContainText('最短');

    // 中の段から下へ強く払っても閉じず、経路の地図を見る状態（低い段）で止まる
    await summary.tap();
    await expect(panel).toHaveAttribute('data-snap', 'half');
    const h2 = await centerOf(handle);
    await touchDrag(page, h2, { x: h2.x, y: h2.y + 500 }, { steps: 6, stepMs: 8, holdMs: 0 });
    await expect(panel).toHaveAttribute('data-snap', 'peek');
    await expect(summary).toBeInViewport();
    // 低い段からさらに下へ払っても閉じない
    const h3 = await centerOf(handle);
    await touchDrag(page, h3, { x: h3.x, y: h3.y + 200 }, { steps: 6, stepMs: 8, holdMs: 0 });
    await expect(panel).toHaveAttribute('data-snap', 'peek');
    await expect(summary).toBeInViewport();

    // 解除は × だけ
    await panel.getByRole('button', { name: 'ルートパネルを閉じる' }).first().tap();
    await expect(panel).toBeHidden();
  });
});
