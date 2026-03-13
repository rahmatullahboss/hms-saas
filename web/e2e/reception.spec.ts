/**
 * E2E: Reception Dashboard — Billing, Serials, Appointments
 */
import { test, expect } from '@playwright/test';
import { loginAs, mockGet, mockMutation, fixtures, BASE_SLUG_PATH } from './helpers/auth';

const receptionMocks = async (page: import('@playwright/test').Page) => {
  await mockGet(page, '**/api/billing**', fixtures.billing);
  await mockGet(page, '**/api/serials**', { serials: [] });
  await mockGet(page, '**/api/appointments**', fixtures.appointments);
  await mockGet(page, '**/api/patients**', fixtures.patients);
};

test.describe('Reception Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await receptionMocks(page);
    await loginAs(page, 'reception', `${BASE_SLUG_PATH}/reception/dashboard`);
  });

  test('shows Reception Dashboard heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /reception|dashboard/i })).toBeVisible({ timeout: 8000 });
  });

  test('shows today\'s billing summary stats', async ({ page }) => {
    await expect(page.getByText(/bill|billed|invoice/i)).toBeVisible({ timeout: 8000 });
  });

  test('page loads without JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForLoadState('networkidle');
    const fatalErrors = errors.filter(e => !e.includes('ResizeObserver') && !e.includes('favicon'));
    expect(fatalErrors).toHaveLength(0);
  });
});

test.describe('Reception — New Bill', () => {
  test.beforeEach(async ({ page }) => {
    await receptionMocks(page);
    await mockMutation(page, '**/api/billing**', { success: true, bill: { id: 100, invoice_number: 'INV-000100' } });
    await loginAs(page, 'reception', `${BASE_SLUG_PATH}/reception/dashboard`);
  });

  test('has button to create new bill', async ({ page }) => {
    const newBillBtn = page.getByRole('button', { name: /new bill|create bill|add bill/i });
    await expect(newBillBtn.first()).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Reception — Patient Registration', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/patients**', fixtures.patients);
    await loginAs(page, 'reception', `${BASE_SLUG_PATH}/reception/patients/new`);
  });

  test('shows patient form', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /patient|add|register/i })).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Reception — Appointments', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/appointments**', fixtures.appointments);
    await loginAs(page, 'reception', `${BASE_SLUG_PATH}/reception/appointments`);
  });

  test('shows Appointments page', async ({ page }) => {
    await expect(page.getByText(/appointment/i)).toBeVisible({ timeout: 8000 });
  });

  test('shows appointment data', async ({ page }) => {
    await expect(page.getByText(/Farida Begum|Dr\. Ahmed|10:00/i)).toBeVisible({ timeout: 8000 });
  });
});
