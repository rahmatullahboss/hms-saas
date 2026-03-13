import { test, expect } from '@playwright/test';

test.describe('Responsive Design — Login Page', () => {
  const viewports = [
    { name: 'Mobile (375px)', width: 375, height: 667 },
    { name: 'Tablet (768px)', width: 768, height: 1024 },
    { name: 'Desktop (1440px)', width: 1440, height: 900 },
    { name: 'Wide Desktop (1920px)', width: 1920, height: 1080 },
  ];

  for (const viewport of viewports) {
    test(`login page renders on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/login');
      await expect(page.getByRole('heading', { name: /hospital management/i })).toBeVisible({ timeout: 8000 });
      await expect(page.getByLabel(/email/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /^login$/i })).toBeVisible();
    });
  }
});

test.describe('Responsive Design — Patient Portal Login', () => {
  test('patient login renders on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/patient/login');
    await expect(page.getByRole('heading', { name: /patient portal/i })).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole('button', { name: /send otp/i })).toBeVisible();
  });

  test('patient login card fits within mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/patient/login');

    const card = page.locator('div').filter({ hasText: /patient portal/i }).first();
    const box = await card.boundingBox();
    if (box) {
      // Card should not overflow horizontally
      expect(box.x + box.width).toBeLessThanOrEqual(395); // 375 + small tolerance
    }
  });
});

test.describe('Responsive Design — Page Titles', () => {
  const pages = [
    { path: '/login', titlePattern: /hms|hospital/i },
    { path: '/patient/login', titlePattern: /hms|hospital/i },
  ];

  for (const { path, titlePattern } of pages) {
    test(`${path} has correct document title`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveTitle(titlePattern, { timeout: 8000 });
    });
  }
});
