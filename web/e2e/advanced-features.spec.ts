/**
 * E2E: Advanced Features — Telemedicine, Insurance, Multi-Branch,
 *   Patient Timeline, Print Pages, Journal Entries, Recurring Expenses, Accept Invite
 */
import { test, expect } from '@playwright/test';
import { loginAs, mockGet, fixtures, BASE_SLUG_PATH } from './helpers/auth';

// ── Telemedicine ──────────────────────────────────────────────────────────────

test.describe('Telemedicine Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/telemedicine/**', { sessions: [], upcoming: [] });
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/telemedicine`);
  });

  test('shows Telemedicine heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /telemedicine|video/i })).toBeVisible({ timeout: 8000 });
  });

  test('renders without crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForLoadState('networkidle');
    const fatalErrors = errors.filter(e => !e.includes('ResizeObserver'));
    expect(fatalErrors).toHaveLength(0);
  });
});

// ── Insurance Claims ──────────────────────────────────────────────────────────

test.describe('Insurance Claims', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/insurance-claims**', {
      claims: [
        { id: 1, patient_name: 'Rahim Uddin', insurer: 'Green Delta', status: 'pending', amount: 10000 },
      ],
    });
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/insurance-claims`);
  });

  test('shows Insurance Claims heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /insurance|claims?/i })).toBeVisible({ timeout: 8000 });
  });

  test('shows claims data', async ({ page }) => {
    await expect(page.getByText(/Green Delta|Rahim Uddin|pending/i)).toBeVisible({ timeout: 8000 });
  });
});

// ── Multi-Branch Dashboard ────────────────────────────────────────────────────

test.describe('Multi-Branch Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/branches/**', {
      branches: [
        { id: 1, name: 'Main Branch', location: 'Dhaka', status: 'active' },
        { id: 2, name: 'Chittagong Branch', location: 'Chittagong', status: 'active' },
      ],
    });
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/multi-branch`);
  });

  test('shows Multi-Branch heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /multi.branch|branch/i })).toBeVisible({ timeout: 8000 });
  });

  test('shows branch data', async ({ page }) => {
    await expect(page.getByText(/Main Branch|Dhaka/i)).toBeVisible({ timeout: 8000 });
  });
});

// ── Patient Timeline ──────────────────────────────────────────────────────────

test.describe('Patient Timeline', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/patients/1/timeline**', { events: [] });
    await mockGet(page, '**/api/patients/1**', {
      id: 1, name: 'Rahim Uddin', patient_code: 'P-000001',
    });
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/patients/1/timeline`);
  });

  test('shows Patient Timeline heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /timeline|history|patient/i })).toBeVisible({ timeout: 8000 });
  });
});

// ── Patient Detail ────────────────────────────────────────────────────────────

test.describe('Patient Detail', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/patients/1**', {
      id: 1, name: 'Rahim Uddin', patient_code: 'P-000001',
      mobile: '01711000001', blood_group: 'A+', address: 'Dhaka',
    });
    await mockGet(page, '**/api/patients/1/**', {});
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/patients/1`);
  });

  test('shows Patient Detail heading', async ({ page }) => {
    await expect(page.getByText(/Rahim Uddin|P-000001|patient detail/i)).toBeVisible({ timeout: 8000 });
  });

  test('shows patient info', async ({ page }) => {
    await expect(page.getByText(/01711000001|A\+|Dhaka/i)).toBeVisible({ timeout: 8000 });
  });
});

// ── Bill Print ────────────────────────────────────────────────────────────────

test.describe('Bill Print', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/billing/1**', {
      id: 1, invoice_number: 'INV-000001', patient_name: 'Rahim Uddin',
      total_amount: 5500, paid_amount: 5500, items: [],
    });
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/billing/1/print`);
  });

  test('shows bill print page', async ({ page }) => {
    await expect(page.getByText(/INV-000001|invoice|bill/i)).toBeVisible({ timeout: 8000 });
  });
});

// ── Journal Entries ───────────────────────────────────────────────────────────

test.describe('Journal Entries', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/accounting/journal**', { entries: [] });
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/journal`);
  });

  test('shows Journal Entries heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /journal|entries/i })).toBeVisible({ timeout: 8000 });
  });
});

// ── Recurring Expenses ────────────────────────────────────────────────────────

test.describe('Recurring Expenses', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/accounting/recurring**', { recurring: [] });
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/recurring`);
  });

  test('shows Recurring Expenses heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /recurring|expense/i })).toBeVisible({ timeout: 8000 });
  });
});

// ── Accept Invite ─────────────────────────────────────────────────────────────

test.describe('Accept Invite Page', () => {
  test('shows accept invite page with token', async ({ page }) => {
    await page.goto(`${BASE_SLUG_PATH}/accept-invite?token=test123`);
    await expect(page.getByText(/accept|invite|join/i)).toBeVisible({ timeout: 8000 });
  });
});

// ── Discharge Summary ─────────────────────────────────────────────────────────

test.describe('Discharge Summary', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/admissions/1**', {
      id: 1, patient_name: 'Rahim Uddin', admission_date: '2025-01-10',
    });
    await mockGet(page, '**/api/admissions/1/discharge**', {});
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/admissions/1/discharge`);
  });

  test('shows Discharge Summary heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /discharge|summary/i })).toBeVisible({ timeout: 8000 });
  });
});
