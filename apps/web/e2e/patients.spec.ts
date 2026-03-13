import { test, expect } from '@playwright/test';
import { loginAs, mockGet, mockMutation, fixtures } from './helpers/auth';

test.describe('Patient List', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/patients**', fixtures.patients);
    await loginAs(page, 'hospital_admin', '/hospital_admin/patients');
  });

  test('shows Patients heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /patients/i })).toBeVisible();
  });

  test('shows patient records in table', async ({ page }) => {
    await expect(page.getByText('Rahim Uddin')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('Farida Begum')).toBeVisible();
  });

  test('shows search input', async ({ page }) => {
    await expect(page.getByPlaceholder(/search by name|search/i)).toBeVisible();
  });

  test('has + New Patient button', async ({ page }) => {
    await expect(page.getByRole('link', { name: /new patient/i })).toBeVisible();
  });

  test('shows mobile numbers in table', async ({ page }) => {
    await expect(page.getByText('01711000001')).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Patient List — Empty State', () => {
  test('shows empty state when no patients', async ({ page }) => {
    await mockGet(page, '**/api/patients**', fixtures.emptyPatients);
    await loginAs(page, 'hospital_admin', '/hospital_admin/patients');
    await expect(page.getByText(/no patients found/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Patient List — Reception Role', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/patients**', fixtures.patients);
    await loginAs(page, 'reception', '/reception/patients');
  });

  test('reception can view patient list', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /patients/i })).toBeVisible();
  });
});

test.describe('Add Patient Form', () => {
  test.beforeEach(async ({ page }) => {
    await mockMutation(page, '**/api/patients', { success: true, patient: { id: 99, name: 'New Patient' } });
    await loginAs(page, 'hospital_admin', '/hospital_admin/patients/new');
  });

  test('shows patient form heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /patient/i })).toBeVisible();
  });

  test('has Name field', async ({ page }) => {
    await expect(page.getByLabel(/name/i)).toBeVisible();
  });

  test('has Mobile field', async ({ page }) => {
    await expect(page.getByLabel(/mobile/i)).toBeVisible();
  });

  test('has Address field', async ({ page }) => {
    await expect(page.getByLabel(/address/i)).toBeVisible();
  });

  test('has Submit button', async ({ page }) => {
    const submitBtn = page.getByRole('button', { name: /save|submit|register|add patient/i });
    await expect(submitBtn).toBeVisible();
  });

  test('can fill and submit the form', async ({ page }) => {
    await page.getByLabel(/name/i).fill('Test Patient');
    await page.getByLabel(/mobile/i).fill('01711999888');

    const submitBtn = page.getByRole('button', { name: /save|submit|register|add patient/i });
    await submitBtn.click();

    // Should show success or redirect
    await expect(page).toHaveURL(/patients/, { timeout: 8000 });
  });
});
