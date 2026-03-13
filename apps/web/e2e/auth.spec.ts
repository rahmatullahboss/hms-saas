import { test, expect } from '@playwright/test';
import { loginAs, mockMutation } from './helpers/auth';

const VALID_TOKEN = 'e2e-test-token-abc123xyz';

test.describe('Login Page — Structure', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('shows HMS title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /hospital management/i })).toBeVisible();
  });

  test('shows Hospital Login tab by default', async ({ page }) => {
    await expect(page.getByRole('button', { name: /hospital login/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /super admin/i })).toBeVisible();
  });

  test('hospital login shows subdomain field', async ({ page }) => {
    // Hospital tab is default
    await expect(page.getByPlaceholder(/hospital-name/i)).toBeVisible();
  });

  test('switching to Super Admin hides subdomain field', async ({ page }) => {
    await page.getByRole('button', { name: /super admin/i }).click();
    await expect(page.getByPlaceholder(/hospital-name/i)).not.toBeVisible();
  });

  test('shows email and password fields', async ({ page }) => {
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test('shows login button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /^login$/i })).toBeVisible();
  });

  test('shows test credentials hint', async ({ page }) => {
    await expect(page.getByText(/test credentials/i)).toBeVisible();
  });
});

test.describe('Login — Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('requires subdomain for hospital login', async ({ page }) => {
    await page.getByLabel(/email/i).fill('user@test.com');
    await page.getByLabel(/password/i).fill('password123');
    await page.getByRole('button', { name: /^login$/i }).click();
    // No subdomain → toast error "Please enter hospital subdomain"
    await expect(page.getByText(/hospital subdomain/i)).toBeVisible();
  });

  test('email field is required (browser validation)', async ({ page }) => {
    const emailInput = page.getByLabel(/email/i);
    await expect(emailInput).toHaveAttribute('required', '');
  });

  test('password field is required', async ({ page }) => {
    const passwordInput = page.getByLabel(/password/i);
    await expect(passwordInput).toHaveAttribute('required', '');
  });
});

test.describe('Login — Hospital Login Flow', () => {
  test('successful hospital login redirects to role dashboard', async ({ page }) => {
    // Mock the login API
    await mockMutation(page, '**/api/auth/login', {
      token: VALID_TOKEN,
      user: { id: 1, name: 'Admin', email: 'admin@demo.com', role: 'hospital_admin' },
    });

    await page.goto('/login');
    await page.getByPlaceholder(/hospital-name/i).fill('demo-hospital');
    await page.getByLabel(/email/i).fill('admin@demo.com');
    await page.getByLabel(/password/i).fill('admin123');
    await page.getByRole('button', { name: /^login$/i }).click();

    // Wait for redirect to happen
    await page.waitForURL(/dashboard/, { timeout: 8000 });
    await expect(page.url()).toContain('dashboard');
  });

  test('failed hospital login shows error toast', async ({ page }) => {
    await page.route('**/api/auth/login', (route) => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid credentials' }),
      });
    });

    await page.goto('/login');
    await page.getByPlaceholder(/hospital-name/i).fill('demo-hospital');
    await page.getByLabel(/email/i).fill('wrong@test.com');
    await page.getByLabel(/password/i).fill('wrongpass');
    await page.getByRole('button', { name: /^login$/i }).click();

    await expect(page.getByText(/invalid credentials|login failed/i)).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Login — Super Admin Flow', () => {
  test('super admin login uses /api/admin/login endpoint', async ({ page }) => {
    let adminEndpointCalled = false;
    await page.route('**/api/admin/login', (route) => {
      adminEndpointCalled = true;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: VALID_TOKEN }),
      });
    });

    await page.goto('/login');
    await page.getByRole('button', { name: /super admin/i }).click();
    await page.getByLabel(/email/i).fill('admin@hms.com');
    await page.getByLabel(/password/i).fill('admin123');
    await page.getByRole('button', { name: /^login$/i }).click();

    await page.waitForResponse('**/api/admin/login');
    expect(adminEndpointCalled).toBe(true);
  });
});

test.describe('Patient Portal Login', () => {
  test('shows Patient Portal heading', async ({ page }) => {
    await page.goto('/patient/login');
    await expect(page.getByRole('heading', { name: /patient portal/i })).toBeVisible();
  });

  test('email step: shows email input and Send OTP button', async ({ page }) => {
    await page.goto('/patient/login');
    await expect(page.getByPlaceholder(/registered email/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /send otp/i })).toBeVisible();
  });

  test('after requesting OTP transitions to OTP step', async ({ page }) => {
    await page.route('**/api/patient-portal/request-otp', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'OTP sent', otp: '123456' }),
      });
    });

    await page.goto('/patient/login');
    await page.getByPlaceholder(/registered email/i).fill('patient@demo.com');
    await page.getByRole('button', { name: /send otp/i }).click();

    // Should transition to OTP step
    await expect(page.getByText(/enter 6-digit otp/i)).toBeVisible({ timeout: 5000 });
    // Dev OTP should be shown from response
    await expect(page.getByText(/dev otp.*123456/i)).toBeVisible();
  });

  test('OTP step: verify OTP and redirect to patient dashboard', async ({ page }) => {
    await page.route('**/api/patient-portal/request-otp', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'OTP sent', otp: '654321' }),
      });
    });

    await page.route('**/api/patient-portal/verify-otp', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'patient-token-xyz',
          user: { id: 7, name: 'Patient User', email: 'patient@demo.com', role: 'patient' },
        }),
      });
    });

    await page.goto('/patient/login');
    await page.getByPlaceholder(/registered email/i).fill('patient@demo.com');
    await page.getByRole('button', { name: /send otp/i }).click();

    await expect(page.getByText(/enter 6-digit otp/i)).toBeVisible({ timeout: 5000 });
    await page.getByPlaceholder('000000').fill('654321');
    await page.getByRole('button', { name: /verify.*login/i }).click();

    await page.waitForURL('/patient/dashboard', { timeout: 8000 });
  });

  test('change email button returns to email step', async ({ page }) => {
    await page.route('**/api/patient-portal/request-otp', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'OTP sent' }) });
    });

    await page.goto('/patient/login');
    await page.getByPlaceholder(/registered email/i).fill('patient@demo.com');
    await page.getByRole('button', { name: /send otp/i }).click();

    await expect(page.getByText(/enter 6-digit otp/i)).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /change email/i }).click();

    // Back to email step
    await expect(page.getByRole('button', { name: /send otp/i })).toBeVisible();
  });

  test('patient login page has link to staff login', async ({ page }) => {
    await page.goto('/patient/login');
    await expect(page.getByRole('link', { name: /staff login/i })).toBeVisible();
  });
});

test.describe('Route Guards', () => {
  test('unauthenticated user redirected to /login from protected route', async ({ page }) => {
    // Clear any stored auth
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());

    await page.goto('/hospital_admin/dashboard');
    // Should be redirected to login
    await expect(page.url()).toContain('/login');
  });

  test('/unauthorized page renders correctly', async ({ page }) => {
    await page.goto('/unauthorized');
    await expect(page.getByText(/access denied|403/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /back to login/i })).toBeVisible();
  });
});
