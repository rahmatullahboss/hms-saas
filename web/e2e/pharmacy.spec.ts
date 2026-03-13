/**
 * E2E: Pharmacy Dashboard — Medicines, Purchases, Sales, Dispensing
 */
import { test, expect } from '@playwright/test';
import { loginAs, mockGet, mockMutation, fixtures, BASE_SLUG_PATH } from './helpers/auth';

const pharmacyMocks = async (page: import('@playwright/test').Page) => {
  await mockGet(page, '**/api/pharmacy/medicines**', fixtures.medicines);
  await mockGet(page, '**/api/pharmacy/sales**', { sales: [], total: 0 });
  await mockGet(page, '**/api/pharmacy/purchases**', { purchases: [], total: 0 });
  await mockGet(page, '**/api/pharmacy/dashboard**', { summary: { total_sales: 0, low_stock: 2 } });
  await mockGet(page, '**/api/pharmacy/**', {});
};

test.describe('Pharmacy Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await pharmacyMocks(page);
    await loginAs(page, 'pharmacist', `${BASE_SLUG_PATH}/pharmacy/dashboard`);
  });

  test('shows Pharmacy Dashboard heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /pharmacy|dashboard/i })).toBeVisible({ timeout: 8000 });
  });

  test('shows medicine list', async ({ page }) => {
    await expect(page.getByText(/paracetamol|medicine|drug|stock/i)).toBeVisible({ timeout: 8000 });
  });

  test('page renders without crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForLoadState('networkidle');
    const fatalErrors = errors.filter(e => !e.includes('ResizeObserver'));
    expect(fatalErrors).toHaveLength(0);
  });
});

test.describe('Medicine Dispensing', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/pharmacy/medicines**', fixtures.medicines);
    await mockGet(page, '**/api/patients**', fixtures.patients);
    await mockMutation(page, '**/api/pharmacy/dispense**', { success: true });
    await loginAs(page, 'pharmacist', `${BASE_SLUG_PATH}/pharmacy/dispensing`);
  });

  test('shows Dispensing page', async ({ page }) => {
    await expect(page.getByText(/dispens|medicine|pharmacy/i)).toBeVisible({ timeout: 8000 });
  });
});
