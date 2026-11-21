import { expect, test } from '@playwright/test';

// 館内の L1 の画面の下書き（docs/indoor-plan.md 11 節）。開発用の入口 ?l1=area1 だけで開き、地図（WebGL）は読まない
test.describe('館内の L1 の画面の下書き（第1学舎）', () => {
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

  test('?l1=area1 で棟 × 階の図が出る（5 棟・連絡路 9 本・A–D は弧、1 階どうしは段が食い違う）', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto('/?l1=area1');
    const diagram = page.getByTestId('l1-diagram');
    await expect(diagram).toBeVisible();
    await expect(page.getByRole('heading', { name: '第1学舎 棟と階のつながり' })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);

    await expect(diagram.locator('[data-wing]')).toHaveCount(5);
    await expect(diagram.locator('[data-edge-id]')).toHaveCount(9);
    await expect(diagram.locator('[data-shape="arc"]')).toHaveCount(2);
    await expect(diagram.locator('[data-slanted="true"]')).toHaveCount(1);
    await expect(diagram.locator('[data-edge-id="bf-area1-ad-1f"]')).toHaveAttribute('data-slanted', 'true');
    await expect(diagram.locator('[data-entrance-id]')).toHaveCount(12);
    // B棟はエレベーターの印が無い（分からない）
    await expect(diagram.locator('[data-wing="area1-b"]')).toHaveAttribute('data-elevator', 'unknown');
    // 393px 幅で横にはみ出さない
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(393);
  });

  test('ふつうの入口（?l1 なし）は今までどおり地図を開く', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByTestId('l1-diagram')).toHaveCount(0);
  });
});
