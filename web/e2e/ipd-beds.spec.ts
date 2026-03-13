/**
 * E2E: IPD (In-Patient Department) — Admissions, Beds, Discharge
 */
import { test, expect } from '@playwright/test';
import { loginAs, mockGet, fixtures, BASE_SLUG_PATH } from './helpers/auth';

test.describe('Admissions (IPD)', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/admissions**', fixtures.admissions);
    await mockGet(page, '**/api/patients**', fixtures.patients);
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/admissions`);
  });

  test('shows Admissions heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /admission|ipd/i })).toBeVisible({ timeout: 8000 });
  });

  test('shows admitted patient', async ({ page }) => {
    await expect(page.getByText(/Rahim Uddin|A-101|admitted/i)).toBeVisible({ timeout: 8000 });
  });

  test('renders without crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForLoadState('networkidle');
    const fatalErrors = errors.filter(e => !e.includes('ResizeObserver'));
    expect(fatalErrors).toHaveLength(0);
  });
});

test.describe('Bed Management', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/beds**', fixtures.beds);
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/beds`);
  });

  test('shows Bed Management heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /beds?|bed management/i })).toBeVisible({ timeout: 8000 });
  });

  test('shows bed numbers', async ({ page }) => {
    await expect(page.getByText(/A-101|A-102/i)).toBeVisible({ timeout: 8000 });
  });

  test('shows bed status (occupied/available)', async ({ page }) => {
    await expect(page.getByText(/occupied|available/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Nurse Station', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/nurse-station/**', { patients: [], vitals: [] });
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/nurse-station`);
  });

  test('shows Nurse Station page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /nurse|station/i })).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Appointment Scheduler', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/appointments**', fixtures.appointments);
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/appointments`);
  });

  test('shows Appointment page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /appointment|schedule/i })).toBeVisible({ timeout: 8000 });
  });

  test('shows appointment data', async ({ page }) => {
    await expect(page.getByText(/Farida Begum|Dr\. Ahmed|confirmed/i)).toBeVisible({ timeout: 8000 });
  });
});
