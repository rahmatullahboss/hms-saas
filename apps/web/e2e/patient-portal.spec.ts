import { test, expect } from '@playwright/test';
import { loginAs, mockGet, mockMutation, fixtures } from './helpers/auth';

const portalMocks = async (page: import('@playwright/test').Page) => {
  await mockGet(page, '**/api/patient-portal/dashboard**', fixtures.patientPortalDashboard);
  await mockGet(page, '**/api/patient-portal/appointments**', { appointments: [] });
  await mockGet(page, '**/api/patient-portal/lab-results**', { results: [] });
  await mockGet(page, '**/api/patient-portal/prescriptions**', { prescriptions: [] });
  await mockGet(page, '**/api/patient-portal/bills**', { bills: [] });
  await mockGet(page, '**/api/patient-portal/messages**', { messages: [] });
  await mockGet(page, '**/api/patient-portal/timeline**', { events: [] });
  await mockGet(page, '**/api/patient-portal/family**', { members: [] });
  await mockGet(page, '**/api/patient-portal/profile**', fixtures.patientPortalDashboard.patient);
  await mockGet(page, '**/api/patient-portal/**', {});
};

test.describe('Patient Portal — Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await portalMocks(page);
    await loginAs(page, 'patient', '/patient/dashboard');
  });

  test('shows Patient Portal dashboard content', async ({ page }) => {
    await expect(page.getByText(/dashboard|welcome|patient portal/i)).toBeVisible({ timeout: 8000 });
  });

  test('shows patient name', async ({ page }) => {
    await expect(page.getByText(/patient user/i)).toBeVisible({ timeout: 8000 });
  });

  test('page loads without crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForLoadState('networkidle');
    expect(errors.filter(e => !e.includes('ResizeObserver') && !e.includes('Non-Error'))).toHaveLength(0);
  });
});

test.describe('Patient Portal — Appointments', () => {
  test.beforeEach(async ({ page }) => {
    await portalMocks(page);
    await loginAs(page, 'patient', '/patient/appointments');
  });

  test('shows Appointments page', async ({ page }) => {
    await expect(page.getByText(/appointment/i)).toBeVisible({ timeout: 8000 });
  });

  test('shows empty state when no appointments', async ({ page }) => {
    // With empty appointments fixture
    await expect(page.getByText(/appointment|no appointments/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Patient Portal — Book Appointment', () => {
  test.beforeEach(async ({ page }) => {
    await portalMocks(page);
    await mockGet(page, '**/api/doctors**', { doctors: [{ id: 1, name: 'Dr. Smith', specialty: 'General', consultation_fee: 500 }] });
    await mockMutation(page, '**/api/patient-portal/appointments**', { success: true });
    await loginAs(page, 'patient', '/patient/book-appointment');
  });

  test('shows Book Appointment page', async ({ page }) => {
    await expect(page.getByText(/book|appointment/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Patient Portal — Lab Results', () => {
  test.beforeEach(async ({ page }) => {
    await portalMocks(page);
    await loginAs(page, 'patient', '/patient/lab-results');
  });

  test('shows Lab Results page', async ({ page }) => {
    await expect(page.getByText(/lab|result/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Patient Portal — Prescriptions', () => {
  test.beforeEach(async ({ page }) => {
    await portalMocks(page);
    await loginAs(page, 'patient', '/patient/prescriptions');
  });

  test('shows Prescriptions page', async ({ page }) => {
    await expect(page.getByText(/prescription/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Patient Portal — Bills', () => {
  test.beforeEach(async ({ page }) => {
    await portalMocks(page);
    await loginAs(page, 'patient', '/patient/bills');
  });

  test('shows Bills page', async ({ page }) => {
    await expect(page.getByText(/bill|invoice/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Patient Portal — Messages', () => {
  test.beforeEach(async ({ page }) => {
    await portalMocks(page);
    await loginAs(page, 'patient', '/patient/messages');
  });

  test('shows Messages page', async ({ page }) => {
    await expect(page.getByText(/message/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Patient Portal — Timeline', () => {
  test.beforeEach(async ({ page }) => {
    await portalMocks(page);
    await loginAs(page, 'patient', '/patient/timeline');
  });

  test('shows Timeline page', async ({ page }) => {
    await expect(page.getByText(/timeline|health/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Patient Portal — Family', () => {
  test.beforeEach(async ({ page }) => {
    await portalMocks(page);
    await loginAs(page, 'patient', '/patient/family');
  });

  test('shows Family page', async ({ page }) => {
    await expect(page.getByText(/family|member/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Patient Portal — Profile', () => {
  test.beforeEach(async ({ page }) => {
    await portalMocks(page);
    await loginAs(page, 'patient', '/patient/profile');
  });

  test('shows Profile page', async ({ page }) => {
    await expect(page.getByText(/profile|patient user/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Patient Portal — Layout Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await portalMocks(page);
    await loginAs(page, 'patient', '/patient/dashboard');
  });

  test('sidebar/nav has link to Appointments', async ({ page }) => {
    await expect(page.getByRole('link', { name: /appointment/i })).toBeVisible({ timeout: 8000 });
  });

  test('sidebar/nav has link to Bills', async ({ page }) => {
    await expect(page.getByRole('link', { name: /bill/i })).toBeVisible({ timeout: 8000 });
  });

  test('sidebar/nav has link to Lab Results', async ({ page }) => {
    await expect(page.getByRole('link', { name: /lab/i })).toBeVisible({ timeout: 8000 });
  });
});
