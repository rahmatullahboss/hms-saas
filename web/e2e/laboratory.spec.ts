/**
 * E2E: Laboratory Dashboard — Tests, Orders, Results
 */
import { test, expect } from '@playwright/test';
import { loginAs, mockGet, fixtures, BASE_SLUG_PATH } from './helpers/auth';

test.describe('Laboratory Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/lab/**', { tests: [], orders: [] });
    await mockGet(page, '**/api/lab-tests**', fixtures.labTests);
    await loginAs(page, 'laboratory', `${BASE_SLUG_PATH}/lab/dashboard`);
  });

  test('shows Lab Dashboard heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /lab|laboratory|dashboard/i })).toBeVisible({ timeout: 8000 });
  });

  test('shows test categories or orders', async ({ page }) => {
    await expect(page.getByText(/test|order|result|lab/i)).toBeVisible({ timeout: 8000 });
  });

  test('page renders without crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForLoadState('networkidle');
    const fatalErrors = errors.filter(e => !e.includes('ResizeObserver'));
    expect(fatalErrors).toHaveLength(0);
  });
});

test.describe('Test Catalog', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/test-catalog**', fixtures.labTests);
    await mockGet(page, '**/api/lab-tests**', fixtures.labTests);
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/test-catalog`);
  });

  test('shows Test Catalog heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /test catalog|lab tests?/i })).toBeVisible({ timeout: 8000 });
  });

  test('shows test names', async ({ page }) => {
    await expect(page.getByText('CBC')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('Urine R/E')).toBeVisible();
  });

  test('shows test prices', async ({ page }) => {
    await expect(page.getByText(/500|300|200/)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Lab Test Order Form', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/patients**', fixtures.patients);
    await mockGet(page, '**/api/lab-tests**', fixtures.labTests);
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/lab/order/new`);
  });

  test('shows Lab Test Order form', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /lab|order|test/i })).toBeVisible({ timeout: 8000 });
  });

  test('has patient selection', async ({ page }) => {
    await expect(page.getByText(/patient/i)).toBeVisible({ timeout: 8000 });
  });
});
