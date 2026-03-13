/**
 * E2E: Accounting Module — Dashboard, Income, Expenses, Reports, Audit
 */
import { test, expect } from '@playwright/test';
import { loginAs, mockGet, fixtures, BASE_SLUG_PATH } from './helpers/auth';

const accountingMocks = async (page: import('@playwright/test').Page) => {
  await mockGet(page, '**/api/accounting/dashboard**', fixtures.accountingDashboard);
  await mockGet(page, '**/api/accounting/income**', fixtures.income);
  await mockGet(page, '**/api/accounting/expenses**', fixtures.expenses);
  await mockGet(page, '**/api/accounting/reports**', { data: [] });
  await mockGet(page, '**/api/accounting/audit**', { logs: [] });
  await mockGet(page, '**/api/accounting/recurring**', { recurring: [] });
  await mockGet(page, '**/api/accounting/accounts**', { accounts: [] });
  await mockGet(page, '**/api/accounting/**', {});
};

test.describe('Accounting Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await accountingMocks(page);
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/accounting`);
  });

  test('shows Accounting heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /accounting|dashboard/i })).toBeVisible({ timeout: 8000 });
  });

  test('shows income/expenses summary', async ({ page }) => {
    await expect(page.getByText(/income|expense|profit|revenue/i)).toBeVisible({ timeout: 8000 });
  });

  test('renders without crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForLoadState('networkidle');
    const fatalErrors = errors.filter(e => !e.includes('ResizeObserver'));
    expect(fatalErrors).toHaveLength(0);
  });
});

test.describe('Income List', () => {
  test.beforeEach(async ({ page }) => {
    await accountingMocks(page);
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/income`);
  });

  test('shows Income page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /income/i })).toBeVisible({ timeout: 8000 });
  });

  test('shows income entries', async ({ page }) => {
    await expect(page.getByText(/5,000|5000|billing|source/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Expense List', () => {
  test.beforeEach(async ({ page }) => {
    await accountingMocks(page);
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/expenses`);
  });

  test('shows Expenses page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /expenses?/i })).toBeVisible({ timeout: 8000 });
  });

  test('shows expense entries', async ({ page }) => {
    await expect(page.getByText(/2,000|2000|salary|general/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Chart of Accounts', () => {
  test.beforeEach(async ({ page }) => {
    await accountingMocks(page);
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/accounts`);
  });

  test('shows Chart of Accounts page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /chart|accounts?/i })).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Audit Logs', () => {
  test.beforeEach(async ({ page }) => {
    await accountingMocks(page);
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/audit`);
  });

  test('shows Audit page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /audit|log/i })).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Accounting — MD Role', () => {
  test.beforeEach(async ({ page }) => {
    await accountingMocks(page);
    await loginAs(page, 'md', `${BASE_SLUG_PATH}/md/accounting`);
  });

  test('MD can access accounting dashboard', async ({ page }) => {
    await expect(page.getByText(/accounting|income|expense/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Accounting — Director Role', () => {
  test.beforeEach(async ({ page }) => {
    await accountingMocks(page);
    await loginAs(page, 'director', `${BASE_SLUG_PATH}/director/accounting`);
  });

  test('Director can access accounting dashboard', async ({ page }) => {
    await expect(page.getByText(/accounting|income|expense/i)).toBeVisible({ timeout: 8000 });
  });
});
