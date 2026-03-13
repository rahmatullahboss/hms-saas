/**
 * E2E: Staff Management — List, Add, Roles, Salary Reports
 */
import { test, expect } from '@playwright/test';
import { loginAs, mockGet, mockMutation, fixtures, BASE_SLUG_PATH } from './helpers/auth';

test.describe('Staff List', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/staff**', fixtures.staff);
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/staff`);
  });

  test('shows Staff heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /staff|employees?/i })).toBeVisible({ timeout: 8000 });
  });

  test('shows staff names', async ({ page }) => {
    await expect(page.getByText('Dr. Ahmed')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('Nurse Rima')).toBeVisible();
  });

  test('shows staff roles', async ({ page }) => {
    await expect(page.getByText(/doctor|nurse/i)).toBeVisible({ timeout: 8000 });
  });

  test('has Invite/Add Staff button', async ({ page }) => {
    const btn = page.getByRole('button', { name: /invite|add staff|new staff/i })
      .or(page.getByRole('link', { name: /invite|add staff/i }));
    await expect(btn.first()).toBeVisible({ timeout: 8000 });
  });

  test('renders without crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForLoadState('networkidle');
    const fatalErrors = errors.filter(e => !e.includes('ResizeObserver'));
    expect(fatalErrors).toHaveLength(0);
  });
});

test.describe('Staff — MD Can View', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/staff**', fixtures.staff);
    await loginAs(page, 'md', `${BASE_SLUG_PATH}/md/staff`);
  });

  test('MD can view staff list', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /staff/i })).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('Dr. Ahmed')).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Invite Staff', () => {
  test.beforeEach(async ({ page }) => {
    await mockMutation(page, '**/api/invitations**', { success: true });
    await mockGet(page, '**/api/staff**', fixtures.staff);
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/invitations`);
  });

  test('shows Invite Staff page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /invite|staff/i })).toBeVisible({ timeout: 8000 });
  });

  test('has email input', async ({ page }) => {
    await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 8000 });
  });

  test('has role selector', async ({ page }) => {
    await expect(page.getByRole('combobox').or(page.locator('select')).first()).toBeVisible({ timeout: 8000 });
  });
});
