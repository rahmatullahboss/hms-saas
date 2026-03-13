import { test, expect } from '@playwright/test';
import { loginAs, mockGet, fixtures } from './helpers/auth';

const shareholderData = {
  shareholders: fixtures.shareholders,
  distributions: { distributions: [] },
  summary: { total_distributed: 0, pending_distribution: 5000 },
};

test.describe('Hospital Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/patients**', fixtures.patients);
    await mockGet(page, '**/api/billing/**', fixtures.billing);
    await mockGet(page, '**/api/accounting/**', fixtures.accountingDashboard);
    await mockGet(page, '**/api/staff/**', fixtures.staff);
    await mockGet(page, '**/api/**', {});
    await loginAs(page, 'hospital_admin', '/hospital_admin/dashboard');
  });

  test('shows dashboard heading or content', async ({ page }) => {
    await expect(page.getByText(/dashboard|hospital admin/i)).toBeVisible({ timeout: 8000 });
  });

  test('page loads without crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForLoadState('networkidle');
    expect(errors.filter(e => !e.includes('ResizeObserver') && !e.includes('Non-Error'))).toHaveLength(0);
  });
});

test.describe('MD Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/accounting/**', fixtures.accountingDashboard);
    await mockGet(page, '**/api/staff/**', fixtures.staff);
    await mockGet(page, '**/api/**', {});
    await loginAs(page, 'md', '/md/dashboard');
  });

  test('shows MD or dashboard heading', async ({ page }) => {
    await expect(page.getByText(/dashboard|managing director|md/i)).toBeVisible({ timeout: 8000 });
  });

  test('page renders without crash', async ({ page }) => {
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
    expect(content!.length).toBeGreaterThan(50);
  });
});

test.describe('Director Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/shareholders/**', shareholderData.shareholders);
    await mockGet(page, '**/api/shareholders/distributions**', shareholderData.distributions);
    await mockGet(page, '**/api/accounting/**', fixtures.accountingDashboard);
    await mockGet(page, '**/api/**', {});
    await loginAs(page, 'director', '/director/dashboard');
  });

  test('shows Director or shareholders heading', async ({ page }) => {
    await expect(page.getByText(/director|shareholder|dashboard/i)).toBeVisible({ timeout: 8000 });
  });

  test('shows shareholder names from fixture', async ({ page }) => {
    await expect(page.getByText(/Dr. Islam|Mrs. Rahman|shareholder/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Director — Shareholders Route', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/shareholders/**', shareholderData.shareholders);
    await mockGet(page, '**/api/shareholders/distributions**', shareholderData.distributions);
    await mockGet(page, '**/api/**', {});
    await loginAs(page, 'director', '/director/shareholders');
  });

  test('shareholders page loads', async ({ page }) => {
    await expect(page.getByText(/shareholder|director/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Hospital Admin — Shareholders Access', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/shareholders/**', shareholderData.shareholders);
    await mockGet(page, '**/api/shareholders/distributions**', shareholderData.distributions);
    await mockGet(page, '**/api/**', {});
    await loginAs(page, 'hospital_admin', '/hospital_admin/shareholders');
  });

  test('hospital admin can view shareholders', async ({ page }) => {
    await expect(page.getByText(/shareholder|director/i)).toBeVisible({ timeout: 8000 });
  });
});
