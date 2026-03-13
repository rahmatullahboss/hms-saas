import { test, expect } from '@playwright/test';
import { loginAs, mockGet, mockMutation, fixtures } from './helpers/auth';

test.describe('Reception Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/patients**', fixtures.patients);
    await loginAs(page, 'reception', '/reception/dashboard');
  });

  test('shows Reception Dashboard heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /reception dashboard/i })).toBeVisible({ timeout: 8000 });
  });

  test('shows stats cards', async ({ page }) => {
    await expect(page.getByText(/today's patients/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/waiting/i)).toBeVisible();
    await expect(page.getByText(/in progress/i)).toBeVisible();
    await expect(page.getByText(/completed/i)).toBeVisible();
  });

  test('shows New Bill button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /new bill/i })).toBeVisible({ timeout: 8000 });
  });

  test('shows New Patient link', async ({ page }) => {
    await expect(page.getByRole('link', { name: /new patient/i })).toBeVisible({ timeout: 8000 });
  });

  test('shows serial list table', async ({ page }) => {
    await expect(page.getByText(/today's serial list/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Reception — New Bill Modal', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/patients**', fixtures.patients);
    await mockMutation(page, '**/api/billing', { success: true, id: 1 });
    await loginAs(page, 'reception', '/reception/dashboard');
  });

  test('clicking New Bill opens modal', async ({ page }) => {
    await page.getByRole('button', { name: /new bill/i }).click({ timeout: 8000 });
    await expect(page.getByRole('heading', { name: /create new bill/i })).toBeVisible();
  });

  test('modal shows patient select dropdown', async ({ page }) => {
    await page.getByRole('button', { name: /new bill/i }).click({ timeout: 8000 });
    await expect(page.getByLabel(/select patient/i)).toBeVisible();
  });

  test('modal shows bill amount fields', async ({ page }) => {
    await page.getByRole('button', { name: /new bill/i }).click({ timeout: 8000 });
    await expect(page.getByLabel(/test bill/i)).toBeVisible();
    await expect(page.getByLabel(/doctor visit/i)).toBeVisible();
    await expect(page.getByLabel(/operation/i)).toBeVisible();
    await expect(page.getByLabel(/medicine/i)).toBeVisible();
    await expect(page.getByLabel(/discount/i)).toBeVisible();
  });

  test('modal shows total calculation', async ({ page }) => {
    await page.getByRole('button', { name: /new bill/i }).click({ timeout: 8000 });
    await expect(page.getByText(/total:/i)).toBeVisible();
  });

  test('modal has Create Bill and Cancel buttons', async ({ page }) => {
    await page.getByRole('button', { name: /new bill/i }).click({ timeout: 8000 });
    await expect(page.getByRole('button', { name: /create bill/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();
  });

  test('cancel closes modal', async ({ page }) => {
    await page.getByRole('button', { name: /new bill/i }).click({ timeout: 8000 });
    await expect(page.getByRole('heading', { name: /create new bill/i })).toBeVisible();
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByRole('heading', { name: /create new bill/i })).not.toBeVisible();
  });

  test('shows error toast if no patient selected when creating bill', async ({ page }) => {
    await page.getByRole('button', { name: /new bill/i }).click({ timeout: 8000 });
    await page.getByRole('button', { name: /create bill/i }).click();
    await expect(page.getByText(/please select a patient/i)).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Reception — Hospital Admin Access', () => {
  test('hospital admin can access reception billing route', async ({ page }) => {
    await mockGet(page, '**/api/patients**', fixtures.patients);
    await loginAs(page, 'hospital_admin', '/hospital_admin/billing');
    await expect(page.getByRole('heading', { name: /reception dashboard/i })).toBeVisible({ timeout: 8000 });
  });
});
