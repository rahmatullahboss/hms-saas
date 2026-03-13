import { test, expect } from '@playwright/test';
import { loginAs, mockGet, fixtures } from './helpers/auth';

function mockAccountingApis(page: Parameters<typeof mockGet>[0]) {
  return Promise.all([
    mockGet(page, '**/api/accounting/dashboard**', fixtures.accountingDashboard),
    mockGet(page, '**/api/accounting/income**', fixtures.income),
    mockGet(page, '**/api/accounting/expenses**', fixtures.expenses),
    mockGet(page, '**/api/accounting/reports**', { report: [] }),
    mockGet(page, '**/api/accounting/audit**', { logs: [] }),
    mockGet(page, '**/api/accounting/recurring**', { expenses: [] }),
    mockGet(page, '**/api/accounting/accounts**', { accounts: [] }),
    mockGet(page, '**/api/accounting/**', {}),
  ]);
}

test.describe('Accounting Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockAccountingApis(page);
    await loginAs(page, 'hospital_admin', '/hospital_admin/accounting');
  });

  test('shows Accounting heading', async ({ page }) => {
    await expect(page.getByText(/accounting/i)).toBeVisible({ timeout: 8000 });
  });

  test('page loads without JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForLoadState('networkidle');
    expect(errors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
  });
});

test.describe('Income List', () => {
  test.beforeEach(async ({ page }) => {
    await mockAccountingApis(page);
    await loginAs(page, 'hospital_admin', '/hospital_admin/income');
  });

  test('shows Income heading', async ({ page }) => {
    await expect(page.getByText(/income/i)).toBeVisible({ timeout: 8000 });
  });

  test('shows income records from fixture', async ({ page }) => {
    await expect(page.getByText(/patient bill|billing/i)).toBeVisible({ timeout: 8000 });
  });

  test('shows income amount', async ({ page }) => {
    await expect(page.getByText(/5000|5,000/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Expense List', () => {
  test.beforeEach(async ({ page }) => {
    await mockAccountingApis(page);
    await loginAs(page, 'hospital_admin', '/hospital_admin/expenses');
  });

  test('shows Expense heading', async ({ page }) => {
    await expect(page.getByText(/expense/i)).toBeVisible({ timeout: 8000 });
  });

  test('shows expense records from fixture', async ({ page }) => {
    await expect(page.getByText(/salary|staff salary/i)).toBeVisible({ timeout: 8000 });
  });

  test('shows expense amount', async ({ page }) => {
    await expect(page.getByText(/2000|2,000/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Reports Page', () => {
  test.beforeEach(async ({ page }) => {
    await mockAccountingApis(page);
    await loginAs(page, 'hospital_admin', '/hospital_admin/reports');
  });

  test('shows Reports heading', async ({ page }) => {
    await expect(page.getByText(/reports?/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Audit Logs', () => {
  test.beforeEach(async ({ page }) => {
    await mockAccountingApis(page);
    await loginAs(page, 'hospital_admin', '/hospital_admin/audit');
  });

  test('shows Audit heading', async ({ page }) => {
    await expect(page.getByText(/audit/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Recurring Expenses', () => {
  test.beforeEach(async ({ page }) => {
    await mockAccountingApis(page);
    await loginAs(page, 'hospital_admin', '/hospital_admin/recurring');
  });

  test('shows Recurring heading', async ({ page }) => {
    await expect(page.getByText(/recurring/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Chart of Accounts', () => {
  test.beforeEach(async ({ page }) => {
    await mockAccountingApis(page);
    await loginAs(page, 'hospital_admin', '/hospital_admin/accounts');
  });

  test('shows Accounts heading', async ({ page }) => {
    await expect(page.getByText(/account/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('MD Role — Accounting Access', () => {
  test.beforeEach(async ({ page }) => {
    await mockAccountingApis(page);
    await loginAs(page, 'md', '/md/accounting');
  });

  test('MD can view accounting dashboard', async ({ page }) => {
    await expect(page.getByText(/accounting/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Director Role — Accounting Access', () => {
  test.beforeEach(async ({ page }) => {
    await mockAccountingApis(page);
    await loginAs(page, 'director', '/director/accounting');
  });

  test('Director can view accounting dashboard', async ({ page }) => {
    await expect(page.getByText(/accounting/i)).toBeVisible({ timeout: 8000 });
  });
});
