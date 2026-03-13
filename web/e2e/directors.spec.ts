/**
 * E2E: Director/MD/Hospital Admin Dashboards + Shareholders
 */
import { test, expect } from '@playwright/test';
import { loginAs, mockGet, fixtures, BASE_SLUG_PATH } from './helpers/auth';

test.describe('Hospital Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/dashboard**', {
      stats: { total_patients: 150, today_income: 25000, pending_bills: 5, active_staff: 20 },
    });
    await mockGet(page, '**/api/patients**', fixtures.patients);
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/dashboard`);
  });

  test('shows Hospital Admin Dashboard', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /dashboard|hospital admin/i })).toBeVisible({ timeout: 8000 });
  });

  test('shows stats (patients, income, staff)', async ({ page }) => {
    await expect(page.getByText(/patient|income|staff|revenue/i)).toBeVisible({ timeout: 8000 });
  });

  test('renders without crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForLoadState('networkidle');
    const fatalErrors = errors.filter(e => !e.includes('ResizeObserver'));
    expect(fatalErrors).toHaveLength(0);
  });
});

test.describe('MD Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/md/**', { summary: {} });
    await mockGet(page, '**/api/dashboard**', { stats: {} });
    await loginAs(page, 'md', `${BASE_SLUG_PATH}/md/dashboard`);
  });

  test('shows MD Dashboard', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /md|managing director|dashboard/i })).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Director Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/director/**', {});
    await mockGet(page, '**/api/dashboard**', { stats: {} });
    await mockGet(page, '**/api/accounting/dashboard**', fixtures.accountingDashboard);
    await loginAs(page, 'director', `${BASE_SLUG_PATH}/director/dashboard`);
  });

  test('shows Director Dashboard', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /director|dashboard/i })).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Shareholder Management', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/shareholders**', fixtures.shareholders);
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/shareholders`);
  });

  test('shows Shareholders page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /shareholder|share/i })).toBeVisible({ timeout: 8000 });
  });

  test('shows shareholder names', async ({ page }) => {
    await expect(page.getByText('Dr. Islam')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('Mrs. Rahman')).toBeVisible();
  });

  test('shows shareholding percentages', async ({ page }) => {
    await expect(page.getByText(/40|60/)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Reports Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/reports/**', { data: [] });
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/reports`);
  });

  test('shows Reports page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /reports?/i })).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/settings**', { hospital: { name: 'Demo Hospital' } });
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/settings`);
  });

  test('shows Settings page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /settings?/i })).toBeVisible({ timeout: 8000 });
  });
});
