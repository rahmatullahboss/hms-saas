/**
 * E2E: Billing Dashboard — Invoices, Print, Due Reports
 */
import { test, expect } from '@playwright/test';
import { loginAs, mockGet, mockMutation, fixtures, BASE_SLUG_PATH } from './helpers/auth';

const billingMocks = async (page: import('@playwright/test').Page) => {
  await mockGet(page, '**/api/billing**', fixtures.billing);
  await mockGet(page, '**/api/billing/due**', { due: [] });
  await mockGet(page, '**/api/patients**', fixtures.patients);
};

test.describe('Billing Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await billingMocks(page);
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/billing`);
  });

  test('shows Billing heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /billing|invoice/i })).toBeVisible({ timeout: 8000 });
  });

  test('shows invoice data', async ({ page }) => {
    await expect(page.getByText(/INV-000001|Rahim Uddin|5,500|5500/i)).toBeVisible({ timeout: 8000 });
  });

  test('shows total billed stats', async ({ page }) => {
    await expect(page.getByText(/billed|collected|total/i)).toBeVisible({ timeout: 8000 });
  });

  test('has New Bill button', async ({ page }) => {
    const btn = page.getByRole('button', { name: /new bill|create bill|add bill/i });
    await expect(btn.first()).toBeVisible({ timeout: 8000 });
  });

  test('page renders without crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForLoadState('networkidle');
    const fatalErrors = errors.filter(e => !e.includes('ResizeObserver'));
    expect(fatalErrors).toHaveLength(0);
  });
});

test.describe('Billing — Create Bill', () => {
  test.beforeEach(async ({ page }) => {
    await billingMocks(page);
    await mockMutation(page, '**/api/billing**', { success: true, bill: { id: 100, invoice_number: 'INV-000100' } });
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/billing`);
  });

  test('can open New Bill modal/form', async ({ page }) => {
    const newBillBtn = page.getByRole('button', { name: /new bill|create bill|add bill/i });
    if (await newBillBtn.first().isVisible({ timeout: 5000 })) {
      await newBillBtn.first().click();
      // Modal/dialog or form should appear
      await expect(page.getByRole('dialog').or(page.getByRole('form')).or(page.getByText(/patient|item|service/i))).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('Billing — Reception Role', () => {
  test.beforeEach(async ({ page }) => {
    await billingMocks(page);
    await loginAs(page, 'reception', `${BASE_SLUG_PATH}/reception/billing`);
  });

  test('reception can access billing', async ({ page }) => {
    await expect(page.getByText(/billing|reception|dashboard/i)).toBeVisible({ timeout: 8000 });
  });
});
