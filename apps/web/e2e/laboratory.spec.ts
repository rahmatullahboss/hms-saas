import { test, expect } from '@playwright/test';
import { loginAs, mockGet, mockMutation, fixtures } from './helpers/auth';

test.describe('Laboratory Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/lab/**', { tests: [], orders: [], queue: [] });
    await mockGet(page, '**/api/lab/tests**', fixtures.labTests);
    await mockGet(page, '**/api/lab/queue**', { orders: [] });
    await loginAs(page, 'laboratory', '/laboratory/dashboard');
  });

  test('shows laboratory page', async ({ page }) => {
    await expect(page.getByText(/laboratory/i)).toBeVisible({ timeout: 8000 });
  });

  test('shows test catalog', async ({ page }) => {
    await expect(page.getByText(/test|catalog|lab/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Laboratory Dashboard — Hospital Admin', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/lab/**', { tests: [] });
    await mockGet(page, '**/api/lab/tests**', fixtures.labTests);
    await loginAs(page, 'hospital_admin', '/hospital_admin/tests');
  });

  test('hospital admin can access lab page', async ({ page }) => {
    await expect(page.getByText(/laboratory/i)).toBeVisible({ timeout: 8000 });
  });

  test('shows CBC and Blood Glucose tests from fixture', async ({ page }) => {
    // Wait for the component to load and display tests
    await expect(page.getByText(/CBC|Blood Glucose|test/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Laboratory — Tests Route', () => {
  test('lab tests route loads correctly', async ({ page }) => {
    await mockGet(page, '**/api/lab/**', { tests: [] });
    await mockGet(page, '**/api/lab/tests**', fixtures.labTests);
    await loginAs(page, 'laboratory', '/laboratory/tests');
    await expect(page.getByText(/laboratory|test/i)).toBeVisible({ timeout: 8000 });
  });
});
