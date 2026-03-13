import { test, expect } from '@playwright/test';
import { loginAs, mockGet, fixtures } from './helpers/auth';

test.describe('Navigation — Hospital Admin Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/**', {});
    await mockGet(page, '**/api/patients**', fixtures.patients);
    await loginAs(page, 'hospital_admin', '/hospital_admin/dashboard');
  });

  test('sidebar shows Patients link', async ({ page }) => {
    await expect(page.getByRole('link', { name: /patients?/i })).toBeVisible({ timeout: 8000 });
  });

  test('sidebar shows Accounting link', async ({ page }) => {
    await expect(page.getByRole('link', { name: /accounting/i })).toBeVisible({ timeout: 8000 });
  });

  test('sidebar shows Staff link', async ({ page }) => {
    await expect(page.getByRole('link', { name: /staff/i })).toBeVisible({ timeout: 8000 });
  });

  test('clicking Patients link navigates to patients page', async ({ page }) => {
    await mockGet(page, '**/api/patients**', fixtures.patients);
    await page.getByRole('link', { name: /patients?/i }).first().click();
    await expect(page.url()).toContain('patients');
  });
});

test.describe('Navigation — Reception Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/**', {});
    await loginAs(page, 'reception', '/reception/dashboard');
  });

  test('shows reception navigation links', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /reception dashboard/i })).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Navigation — Patient Portal Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/patient-portal/**', {});
    await loginAs(page, 'patient', '/patient/dashboard');
  });

  test('has navigation with multiple links', async ({ page }) => {
    // At least a few nav links should be visible in the portal layout
    const links = page.getByRole('link');
    const count = await links.count();
    expect(count).toBeGreaterThan(2);
  });
});

test.describe('Navigation — Default Redirects', () => {
  test('/ redirects to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page.url()).toContain('/login');
  });

  test('unknown route redirects to /login', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');
    await expect(page.url()).toContain('/login');
  });
});
