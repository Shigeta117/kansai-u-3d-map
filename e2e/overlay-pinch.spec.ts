import { devices, expect, test, type Page } from '@playwright/test';

// 地図の上の建物の札で 2 本指を広げたとき、ページが拡大せず地図が拡大すること（再発防止）。
// 以前は札が canvas の外の要素なので、ブラウザがページを拡大し、上の帯やボタンに触れなくなっていた
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

/** 札が出そろって位置が止まるまで待ち、画面の中ほどにある札の中心を返す */
async function labelCenter(page: Page): Promise<{ point: Point; name: string }> {
  const labels = page.locator('button[data-map-gesture="pass"]');
  await expect(labels.first()).toBeVisible({ timeout: 30_000 });
  let prev = '';
  for (let i = 0; i < 40; i++) {
    const found = await labels.evaluateAll((els) => {
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.top > 160 && r.bottom < 700) {
          return { x: r.x + r.width / 2, y: r.y + r.height / 2, name: (el.textContent ?? '').trim() };
        }
      }
      return null;
    });
    const key = found ? `${Math.round(found.x)},${Math.round(found.y)}` : '';
    if (found && key === prev) return { point: { x: found.x, y: found.y }, name: found.name };
    prev = key;
    await page.waitForTimeout(150);
  }
  throw new Error('画面の中ほどに止まった札が見つからない');
}

/** 2 本の指を札の上に置いて広げる（CDP のタッチ。touch-action とブラウザのページの拡大が本物どおりに効く） */
async function pinchOut(page: Page, at: Point) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: Point[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 })) });
  await send('touchStart', [
    { x: at.x - 6, y: at.y },
    { x: at.x + 6, y: at.y },
  ]);
  for (let k = 1; k <= 12; k++) {
    await page.waitForTimeout(16);
    await send('touchMove', [
      { x: at.x - 6 - k * 8, y: at.y - k * 4 },
      { x: at.x + 6 + k * 8, y: at.y + k * 4 },
    ]);
  }
  await send('touchEnd', []);
  await cdp.detach();
}

test.describe('地図の上の札での 2 本指', () => {
  test('札の上で広げるとページは拡大せず、地図が拡大する', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    const { point } = await labelCenter(page);
    const before = await page.locator('canvas').screenshot();
    await pinchOut(page, point);
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
    const after = await page.locator('canvas').screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);
  });

  test('札を 1 本指で軽く叩くと、今までどおりその建物を選ぶ', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    const { point, name } = await labelCenter(page);
    await page.touchscreen.tap(point.x, point.y);
    const sheet = page.getByRole('complementary', { name: '建物・施設の詳細情報' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('heading', { name: new RegExp(name) })).toBeVisible();
  });
});
