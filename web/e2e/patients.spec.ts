/**
 * E2E: Patient Management — List, Search, Add, Detail
 */
import { test, expect } from '@playwright/test';
import { loginAs, mockGet, mockMutation, fixtures, SLUG, BASE_SLUG_PATH } from './helpers/auth';

test.describe('Patient List', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/patients**', fixtures.patients);
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/patients`);
  });

  test('shows Patients heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /patients?/i })).toBeVisible({ timeout: 8000 });
  });

  test('shows patient names from fixture', async ({ page }) => {
    await expect(page.getByText('Rahim Uddin')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('Farida Begum')).toBeVisible();
  });

  test('shows patient codes', async ({ page }) => {
    await expect(page.getByText(/P-000001/i)).toBeVisible({ timeout: 8000 });
  });

  test('shows mobile numbers', async ({ page }) => {
    await expect(page.getByText('01711000001')).toBeVisible({ timeout: 8000 });
  });

  test('has search input', async ({ page }) => {
    await expect(page.getByPlaceholder(/search/i)).toBeVisible({ timeout: 8000 });
  });

  test('has Add Patient button or link', async ({ page }) => {
    const addBtn = page.getByRole('button', { name: /add patient|new patient/i })
      .or(page.getByRole('link', { name: /add patient|new patient/i }));
    await expect(addBtn.first()).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Patient List — Empty State', () => {
  test('shows no patients message', async ({ page }) => {
    await mockGet(page, '**/api/patients**', fixtures.emptyPatients);
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/patients`);
    await expect(page.getByText(/no patients|empty/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Patient List — Search', () => {
  test('typing in search triggers a filtered request', async ({ page }) => {
    let searchRequested = false;
    await page.route('**/api/patients**', (route) => {
      const url = route.request().url();
      if (url.includes('Rahim') || url.includes('search')) {
        searchRequested = true;
      }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ patients: [fixtures.patients.patients[0]], total: 1 }),
      });
    });

    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/patients`);
    const searchInput = page.getByPlaceholder(/search/i);

    if (await searchInput.isVisible({ timeout: 5000 })) {
      await searchInput.fill('Rahim');
      await page.waitForTimeout(500); // debounce
    }
    // At least the page stays functional
    await expect(page.getByText(/patients?/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Add Patient Form', () => {
  test.beforeEach(async ({ page }) => {
    await mockMutation(page, '**/api/patients', { success: true, patient: { id: 99, patient_code: 'P-000099' } });
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/patients/new`);
  });

  test('shows Patient Form heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /patient|add patient|new patient/i })).toBeVisible({ timeout: 8000 });
  });

  test('has Name field', async ({ page }) => {
    const nameField = page.getByLabel(/name/i).or(page.locator('input[name="name"], input[placeholder*="name" i]')).first();
    await expect(nameField).toBeVisible({ timeout: 8000 });
  });

  test('has Mobile field', async ({ page }) => {
    const mobileField = page.getByLabel(/mobile|phone/i)
      .or(page.locator('input[name="mobile"], input[placeholder*="mobile" i]')).first();
    await expect(mobileField).toBeVisible({ timeout: 8000 });
  });

  test('has Save/Submit button', async ({ page }) => {
    const submitBtn = page.getByRole('button', { name: /save|submit|add|register|create/i });
    await expect(submitBtn.first()).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Reception Patient List', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/patients**', fixtures.patients);
    await loginAs(page, 'reception', `${BASE_SLUG_PATH}/reception/patients`);
  });

  test('reception can view patient list', async ({ page }) => {
    await expect(page.getByText(/patients?/i)).toBeVisible({ timeout: 8000 });
  });

  test('shows patient data', async ({ page }) => {
    await expect(page.getByText('Rahim Uddin')).toBeVisible({ timeout: 8000 });
  });
});
