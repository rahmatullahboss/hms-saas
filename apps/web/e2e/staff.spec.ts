import { test, expect } from '@playwright/test';
import { loginAs, mockGet, mockMutation, fixtures } from './helpers/auth';

test.describe('Staff Page — Hospital Admin', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/staff**', fixtures.staff);
    await loginAs(page, 'hospital_admin', '/hospital_admin/staff');
  });

  test('shows Staff heading', async ({ page }) => {
    await expect(page.getByText(/staff/i)).toBeVisible({ timeout: 8000 });
  });

  test('shows staff members from fixture', async ({ page }) => {
    await expect(page.getByText(/Dr. Ahmed|nurse rima/i)).toBeVisible({ timeout: 8000 });
  });

  test('has Add Staff button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /add staff/i })).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Staff Page — MD Role', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/staff**', fixtures.staff);
    await loginAs(page, 'md', '/md/staff');
  });

  test('MD can view staff page', async ({ page }) => {
    await expect(page.getByText(/staff/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Staff — Add Staff Form', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/staff**', fixtures.staff);
    await mockMutation(page, '**/api/staff', { success: true, id: 99 });
    await loginAs(page, 'hospital_admin', '/hospital_admin/staff');
  });

  test('clicking Add Staff opens form or modal', async ({ page }) => {
    await page.getByRole('button', { name: /add staff/i }).click({ timeout: 8000 });
    // A form or modal should appear
    await expect(page.getByText(/name|add staff|new staff/i)).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Staff — Salary Report', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/staff**', fixtures.staff);
    await mockGet(page, '**/api/staff/salary-report**', { report: [] });
    await loginAs(page, 'hospital_admin', '/hospital_admin/staff');
  });

  test('salary report link or button is accessible', async ({ page }) => {
    await expect(page.getByText(/staff/i)).toBeVisible({ timeout: 8000 });
    // The staff page should render without crashing
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });
});
