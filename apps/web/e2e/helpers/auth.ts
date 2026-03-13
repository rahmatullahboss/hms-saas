import { Page, Route } from '@playwright/test';

/**
 * Shared authentication helpers for HMS E2E tests.
 * Uses localStorage injection + API mocking to avoid needing a live backend.
 */

export type HMSRole =
  | 'hospital_admin'
  | 'reception'
  | 'md'
  | 'director'
  | 'laboratory'
  | 'pharmacy'
  | 'patient';

// Fake JWT-ish token (not a real JWT, just a placeholder for storage)
const FAKE_TOKEN = 'e2e-test-token-abc123xyz';
const FAKE_PATIENT_TOKEN = 'e2e-patient-token-xyz456';
const TENANT_SUBDOMAIN = 'demo-hospital';

export const roleUsers: Record<HMSRole, object> = {
  hospital_admin: { id: 1, name: 'Admin User', email: 'admin@demo.com', role: 'hospital_admin' },
  reception: { id: 2, name: 'Reception User', email: 'reception@demo.com', role: 'reception' },
  md: { id: 3, name: 'MD User', email: 'md@demo.com', role: 'md' },
  director: { id: 4, name: 'Director User', email: 'director@demo.com', role: 'director' },
  laboratory: { id: 5, name: 'Lab User', email: 'lab@demo.com', role: 'laboratory' },
  pharmacy: { id: 6, name: 'Pharmacy User', email: 'pharmacy@demo.com', role: 'pharmacy' },
  patient: { id: 7, name: 'Patient User', email: 'patient@demo.com', role: 'patient' },
};

/**
 * Inject auth state into localStorage and navigate to the target URL.
 * Also mocks the /api/auth/me endpoint to return the logged-in user.
 */
export async function loginAs(page: Page, role: HMSRole, path?: string) {
  const user = roleUsers[role];
  const token = role === 'patient' ? FAKE_PATIENT_TOKEN : FAKE_TOKEN;

  // Mock the /api/auth/me endpoint so ProtectedRoute re-hydration works
  await page.route('**/api/auth/me', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user }),
    });
  });

  // Mock login endpoints
  await page.route('**/api/auth/login', (route: Route) => {
    const method = route.request().method();
    if (method === 'POST') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token, user }),
      });
    } else {
      route.continue();
    }
  });

  // Navigate to an empty page first so we can set localStorage
  await page.goto('/login');

  // Inject tokens into localStorage
  await page.evaluate(
    ({ token, user, tenant }: { token: string; user: object; tenant: string }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('tenant', tenant);
      localStorage.setItem('user', JSON.stringify(user));
    },
    { token, user, tenant: TENANT_SUBDOMAIN }
  );

  // Navigate to the target path
  const targetPath = path ?? `/${role}/dashboard`;
  await page.goto(targetPath);
}

/**
 * Mock a GET API endpoint with fixture data.
 */
export async function mockGet(
  page: Page,
  urlPattern: string | RegExp,
  responseData: unknown,
  status = 200
) {
  await page.route(urlPattern, (route: Route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(responseData),
      });
    } else {
      route.continue();
    }
  });
}

/**
 * Mock a POST/PUT/DELETE API endpoint.
 */
export async function mockMutation(
  page: Page,
  urlPattern: string | RegExp,
  responseData: unknown,
  status = 200
) {
  await page.route(urlPattern, (route: Route) => {
    const method = route.request().method();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(responseData),
      });
    } else {
      route.continue();
    }
  });
}

// Common fixture data
export const fixtures = {
  patients: {
    patients: [
      { id: 1, name: 'Rahim Uddin', father_husband: 'Karim Uddin', address: 'Dhaka', mobile: '01711000001', guardian_mobile: '', created_at: '2025-01-01T00:00:00Z' },
      { id: 2, name: 'Farida Begum', father_husband: 'Jamal Hossain', address: 'Chittagong', mobile: '01711000002', guardian_mobile: '', created_at: '2025-01-02T00:00:00Z' },
    ],
  },
  emptyPatients: { patients: [] },
  staff: {
    staff: [
      { id: 1, name: 'Dr. Ahmed', role: 'doctor', department: 'Medicine', is_active: 1, basic_salary: 50000 },
      { id: 2, name: 'Nurse Rima', role: 'nurse', department: 'ICU', is_active: 1, basic_salary: 20000 },
    ],
  },
  income: {
    income: [
      { id: 1, amount: 5000, source: 'billing', description: 'Patient bill', date: '2025-01-01', account: 'General' },
    ],
    total: 5000,
  },
  expenses: {
    expenses: [
      { id: 1, amount: 2000, category: 'salary', description: 'Staff salary', date: '2025-01-01', account: 'General' },
    ],
    total: 2000,
  },
  medicines: {
    medicines: [
      { id: 1, name: 'Paracetamol', category: 'Tablet', unit: 'pcs', reorder_level: 100, quantity: 500, purchase_price: 2, selling_price: 3 },
    ],
  },
  labTests: {
    tests: [
      { id: 1, name: 'CBC', category: 'Hematology', price: 500, is_active: 1 },
      { id: 2, name: 'Blood Glucose', category: 'Biochemistry', price: 300, is_active: 1 },
    ],
  },
  shareholders: {
    shareholders: [
      { id: 1, name: 'Dr. Islam', shares: 40, email: 'islam@demo.com' },
      { id: 2, name: 'Mrs. Rahman', shares: 60, email: 'rahman@demo.com' },
    ],
  },
  billing: {
    bills: [
      { id: 1, invoice_number: 'INV-000001', patient_name: 'Rahim Uddin', total_amount: 500, paid_amount: 500, status: 'paid', created_at: '2025-01-01' },
    ],
    total: 1,
  },
  accountingDashboard: {
    summary: { total_income: 100000, total_expense: 40000, net_profit: 60000, period: 'monthly' },
    recent_transactions: [],
  },
  patientPortalDashboard: {
    patient: { id: 7, name: 'Patient User', email: 'patient@demo.com', mobile: '01711000099', blood_group: 'B+' },
    upcoming_appointments: [],
    recent_bills: [],
    unread_messages: 0,
  },
};
