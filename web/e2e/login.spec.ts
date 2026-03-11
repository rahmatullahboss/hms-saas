import { test, expect } from '@playwright/test';

test.describe('HMS Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should display login form', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /login/i })).toBeVisible();
  });

  test('should have email input field', async ({ page }) => {
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });

  test('should have password input field', async ({ page }) => {
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test('should have login button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /login/i })).toBeVisible();
  });

  test('should show error for empty email', async ({ page }) => {
    await page.getByLabel(/email/i).fill('');
    await page.getByRole('button', { name: /login/i }).click();
    
    // Check for validation error
    const emailInput = page.getByLabel(/email/i);
    await expect(emailInput).toHaveAttribute('required', '');
  });

  test('should show error for empty password', async ({ page }) => {
    await page.getByLabel(/email/i).fill('test@example.com');
    await page.getByRole('button', { name: /login/i }).click();
    
    // Check for validation error
    const passwordInput = page.getByLabel(/password/i);
    await expect(passwordInput).toHaveAttribute('required', '');
  });

  test('should validate email format', async ({ page }) => {
    await page.getByLabel(/email/i).fill('invalid-email');
    await page.getByRole('button', { name: /login/i }).click();
    
    // Should show email validation error
    await expect(page.getByText(/invalid email/i)).toBeVisible();
  });
});

test.describe('HMS Navigation', () => {
  test('should have navigation menu', async ({ page }) => {
    await page.goto('/');
    // After login, should see navigation
    // This test will be updated after authentication is implemented
  });

  test('should have dashboard link', async ({ page }) => {
    await page.goto('/');
    // After login, dashboard link should be visible
  });
});
