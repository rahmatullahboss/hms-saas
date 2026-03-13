/**
 * E2E: Super Admin — Dashboard, Hospital List, Hospital Detail, Onboarding Queue
 * Uses resilient assertions: verifies auth works and pages render.
 */
import { test, expect } from '@playwright/test';
import { loginAs, mockGet, BASE_SLUG_PATH } from './helpers/auth';

async function assertPageRendered(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  expect(page.url()).not.toMatch(/\/login$/);
}

const superAdminMocks = async (page: import('@playwright/test').Page) => {
  await mockGet(page, '**/api/super-admin/**', {});
  await mockGet(page, '**/api/super-admin/dashboard**', {
    stats: { total_hospitals: 5, active_hospitals: 4, pending_onboarding: 1 },
  });
  await mockGet(page, '**/api/super-admin/hospitals**', {
    hospitals: [
      { id: 1, name: 'Demo Hospital', slug: 'demo-hospital', status: 'active', plan: 'pro' },
      { id: 2, name: 'New Medical', slug: 'new-medical', status: 'pending', plan: 'basic' },
    ],
  });
  await mockGet(page, '**/api/super-admin/hospitals/1**', {
    hospital: { id: 1, name: 'Demo Hospital', slug: 'demo-hospital', status: 'active' },
  });
};

test.describe('Super Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await superAdminMocks(page);
    await loginAs(page, 'super_admin', '/super-admin/dashboard');
  });

  test('super admin dashboard renders (auth works)', async ({ page }) => {
    await assertPageRendered(page);
    await expect(page.locator('h1, h2, h3, main').first()).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Super Admin — Hospital List', () => {
  test.beforeEach(async ({ page }) => {
    await superAdminMocks(page);
    await loginAs(page, 'super_admin', '/super-admin/hospitals');
  });

  test('hospital list page renders (auth works)', async ({ page }) => {
    await assertPageRendered(page);
    await expect(page.locator('h1, h2, h3, main').first()).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Super Admin — Hospital Detail', () => {
  test.beforeEach(async ({ page }) => {
    await superAdminMocks(page);
    await loginAs(page, 'super_admin', '/super-admin/hospitals/1');
  });

  test('hospital detail page renders (auth works)', async ({ page }) => {
    await assertPageRendered(page);
    await expect(page.locator('h1, h2, h3, main').first()).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Super Admin — Onboarding Queue', () => {
  test.beforeEach(async ({ page }) => {
    await superAdminMocks(page);
    await loginAs(page, 'super_admin', '/super-admin/onboarding');
  });

  test('onboarding page renders (auth works)', async ({ page }) => {
    await assertPageRendered(page);
    await expect(page.locator('h1, h2, h3, main').first()).toBeVisible({ timeout: 8000 });
  });
});
