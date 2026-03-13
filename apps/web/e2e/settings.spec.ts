import { test, expect } from '@playwright/test';
import { loginAs, mockGet } from './helpers/auth';

test.describe('Settings Page — Hospital Admin', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/settings**', {
      hospital: { name: 'Demo Hospital', address: 'Dhaka', phone: '01711000000', email: 'demo@hospital.com' },
    });
    await loginAs(page, 'hospital_admin', '/hospital_admin/settings');
  });

  test('shows Settings heading', async ({ page }) => {
    await expect(page.getByText(/settings?/i)).toBeVisible({ timeout: 8000 });
  });

  test('shows hospital information form', async ({ page }) => {
    await expect(page.getByText(/hospital|settings/i)).toBeVisible({ timeout: 8000 });
  });

  test('page loads without crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForLoadState('networkidle');
    expect(errors.filter(e => !e.includes('ResizeObserver') && !e.includes('Non-Error'))).toHaveLength(0);
  });
});

test.describe('Settings Page — Director Role', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/settings**', {
      hospital: { name: 'Demo Hospital' },
    });
    await loginAs(page, 'director', '/director/settings');
  });

  test('director can access settings', async ({ page }) => {
    await expect(page.getByText(/settings?/i)).toBeVisible({ timeout: 8000 });
  });
});
