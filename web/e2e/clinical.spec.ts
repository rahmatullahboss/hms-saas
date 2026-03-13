/**
 * E2E: Clinical Features — Prescriptions, Doctor Dashboard, Consultation Notes,
 *   Commissions, IPD Charges, AI Assistant, Triage Chatbot
 */
import { test, expect } from '@playwright/test';
import { loginAs, mockGet, mockMutation, fixtures, BASE_SLUG_PATH } from './helpers/auth';

// ── Digital Prescriptions ─────────────────────────────────────────────────────

test.describe('Digital Prescription — New', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/patients**', fixtures.patients);
    await mockGet(page, '**/api/pharmacy/medicines**', fixtures.medicines);
    await mockMutation(page, '**/api/prescriptions**', { success: true });
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/prescriptions/new`);
  });

  test('shows Prescription form', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /prescription|digital/i })).toBeVisible({ timeout: 8000 });
  });

  test('has patient selector', async ({ page }) => {
    await expect(page.getByText(/patient/i)).toBeVisible({ timeout: 8000 });
  });

  test('renders without crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForLoadState('networkidle');
    const fatalErrors = errors.filter(e => !e.includes('ResizeObserver'));
    expect(fatalErrors).toHaveLength(0);
  });
});

// ── Doctor Dashboard ──────────────────────────────────────────────────────────

test.describe('Doctor Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/doctor/**', { appointments: [], patients: [] });
    await mockGet(page, '**/api/appointments**', fixtures.appointments);
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/doctor/dashboard`);
  });

  test('shows Doctor Dashboard heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /doctor|dashboard/i })).toBeVisible({ timeout: 8000 });
  });

  test('renders without crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForLoadState('networkidle');
    const fatalErrors = errors.filter(e => !e.includes('ResizeObserver'));
    expect(fatalErrors).toHaveLength(0);
  });
});

// ── Doctor Schedule ──────────────────────────────────────────────────────────

test.describe('Doctor Schedule', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/doctor-schedule**', { schedules: [] });
    await mockGet(page, '**/api/staff**', fixtures.staff);
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/doctor-schedule`);
  });

  test('shows Doctor Schedule heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /doctor|schedule/i })).toBeVisible({ timeout: 8000 });
  });
});

// ── Consultation Notes ────────────────────────────────────────────────────────

test.describe('Consultation Notes', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/consultation-notes**', { notes: [] });
    await mockGet(page, '**/api/patients**', fixtures.patients);
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/consultation-notes`);
  });

  test('shows Consultation Notes heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /consultation|notes?/i })).toBeVisible({ timeout: 8000 });
  });
});

// ── Commission Management ─────────────────────────────────────────────────────

test.describe('Commission Management', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/commissions**', { commissions: [] });
    await mockGet(page, '**/api/staff**', fixtures.staff);
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/commissions`);
  });

  test('shows Commission page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /commission/i })).toBeVisible({ timeout: 8000 });
  });
});

// ── IPD Charges ─────────────────────────────────────────────────────────────

test.describe('IPD Charges', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/ipd-charges**', { charges: [] });
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/ipd-charges`);
  });

  test('shows IPD Charges heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /ipd|charges/i })).toBeVisible({ timeout: 8000 });
  });
});

// ── Profit & Loss ─────────────────────────────────────────────────────────────

test.describe('Profit & Loss', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/accounting/profit-loss**', { income: 100000, expense: 40000, net: 60000 });
    await mockGet(page, '**/api/accounting/**', {});
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/profit-loss`);
  });

  test('shows Profit & Loss heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /profit|loss/i })).toBeVisible({ timeout: 8000 });
  });
});

// ── AI Assistant ──────────────────────────────────────────────────────────────

test.describe('AI Assistant', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/ai/**', {});
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/ai-assistant`);
  });

  test('shows AI Assistant heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /ai|assistant/i })).toBeVisible({ timeout: 8000 });
  });
});

// ── System Audit Log ─────────────────────────────────────────────────────────

test.describe('System Audit Log', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/system-audit**', { logs: [] });
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/system-audit`);
  });

  test('shows System Audit heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /system|audit/i })).toBeVisible({ timeout: 8000 });
  });
});

// ── Notifications ────────────────────────────────────────────────────────────

test.describe('Notifications Center', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/notifications**', { notifications: [], unread_count: 0 });
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/notifications`);
  });

  test('shows Notifications heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /notification/i })).toBeVisible({ timeout: 8000 });
  });
});

// ── Triage Chatbot ────────────────────────────────────────────────────────────

test.describe('Triage Chatbot', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/triage/**', {});
    await loginAs(page, 'hospital_admin', `${BASE_SLUG_PATH}/triage`);
  });

  test('shows Triage page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /triage|chatbot|symptom/i })).toBeVisible({ timeout: 8000 });
  });
});
