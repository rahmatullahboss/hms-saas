/**
 * E2E: Super Admin Dashboard — Hospital management, onboarding
 */
import { test, expect } from '@playwright/test';
import { loginAs, mockGet } from './helpers/auth';

const superAdminMocks = async (page: import('@playwright/test').Page) => {
  await mockGet(page, '**/api/admin/dashboard**', {
    stats: { total_hospitals: 10, active_hospitals: 8, pending_onboarding: 2, total_users: 150 },
  });
  await mockGet(page, '**/api/admin/hospitals**', {
    hospitals: [
      { id: 1, name: 'Demo Hospital', slug: 'demo-hospital', status: 'active', plan: 'premium', created_at: '2025-01-01' },
      { id: 2, name: 'City Clinic', slug: 'city-clinic', status: 'active', plan: 'basic', created_at: '2025-02-01' },
    ],
    total: 2,
  });
  await mockGet(page, '**/api/admin/hospitals/1**', {
    id: 1, name: 'Demo Hospital', slug: 'demo-hospital', status: 'active', plan: 'premium',
    staff_count: 20, patient_count: 150,
  });
  await mockGet(page, '**/api/admin/onboarding**', {
    queue: [
      { id: 10, hospital_name: 'New Medical', contact_email: 'new@medical.com', status: 'pending', created_at: '2025-03-01' },
    ],
  });
  await mockGet(page, '**/api/admin/**', {});
};

test.describe('Super Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await superAdminMocks(page);
    await loginAs(page, 'super_admin', '/super-admin/dashboard');
  });

  test('shows Super Admin Dashboard heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /super admin|dashboard/i })).toBeVisible({ timeout: 8000 });
  });

  test('shows hospital stats', async ({ page }) => {
    await expect(page.getByText(/hospital|active|total/i)).toBeVisible({ timeout: 8000 });
  });

  test('renders without crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForLoadState('networkidle');
    const fatalErrors = errors.filter(e => !e.includes('ResizeObserver'));
    expect(fatalErrors).toHaveLength(0);
  });
});

test.describe('Super Admin — Hospital List', () => {
  test.beforeEach(async ({ page }) => {
    await superAdminMocks(page);
    await loginAs(page, 'super_admin', '/super-admin/hospitals');
  });

  test('shows Hospital List heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /hospital/i })).toBeVisible({ timeout: 8000 });
  });

  test('shows hospital names', async ({ page }) => {
    await expect(page.getByText('Demo Hospital')).toBeVisible({ timeout: 8000 });
  });

  test('shows hospital status', async ({ page }) => {
    await expect(page.getByText(/active|premium|basic/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Super Admin — Hospital Detail', () => {
  test.beforeEach(async ({ page }) => {
    await superAdminMocks(page);
    await loginAs(page, 'super_admin', '/super-admin/hospitals/1');
  });

  test('shows hospital detail page', async ({ page }) => {
    await expect(page.getByText(/Demo Hospital|hospital detail/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Super Admin — Onboarding Queue', () => {
  test.beforeEach(async ({ page }) => {
    await superAdminMocks(page);
    await loginAs(page, 'super_admin', '/super-admin/onboarding');
  });

  test('shows Onboarding page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /onboarding|queue/i })).toBeVisible({ timeout: 8000 });
  });

  test('shows pending hospital', async ({ page }) => {
    await expect(page.getByText(/New Medical|pending/i)).toBeVisible({ timeout: 8000 });
  });
});
