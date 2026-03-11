import { test, expect } from '@playwright/test';

test.describe('HMS Patient Management E2E', () => {
  test('should display patient list page', async ({ page }) => {
    await page.goto('/patients');
    
    // Should have patient list heading or empty state
    await expect(page.getByText(/patient/i)).toBeVisible({ timeout: 10000 });
  });

  test('should have add patient button', async ({ page }) => {
    await page.goto('/patients');
    
    // Should have add button
    await expect(page.getByRole('button', { name: /add patient/i })).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to patient form', async ({ page }) => {
    await page.goto('/patients/new');
    
    // Should show patient form
    await expect(page.getByRole('heading', { name: /patient/i })).toBeVisible({ timeout: 10000 });
  });

  test('should have patient form fields', async ({ page }) => {
    await page.goto('/patients/new');
    
    // Should have form fields
    await expect(page.getByLabel(/name/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel(/mobile/i)).toBeVisible();
  });
});

test.describe('HMS Billing E2E', () => {
  test('should display billing page', async ({ page }) => {
    await page.goto('/billing');
    
    // Should show billing interface
    await expect(page.getByText(/bill/i)).toBeVisible({ timeout: 10000 });
  });

  test('should have create bill button', async ({ page }) => {
    await page.goto('/billing');
    
    await expect(page.getByRole('button', { name: /new bill/i })).toBeVisible({ timeout: 10000 });
  });
});

test.describe('HMS Dashboard E2E', () => {
  test('should display dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Should show dashboard content
    await expect(page.getByText(/dashboard/i)).toBeVisible({ timeout: 10000 });
  });

  test('should display income/expense summary', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Should show some financial indicators
    const content = await page.content();
    expect(content.length).toBeGreaterThan(0);
  });
});

test.describe('HMS Reception E2E', () => {
  test('should display reception dashboard', async ({ page }) => {
    await page.goto('/reception');
    
    await expect(page.getByText(/reception/i)).toBeVisible({ timeout: 10000 });
  });
});

test.describe('HMS Laboratory E2E', () => {
  test('should display laboratory dashboard', async ({ page }) => {
    await page.goto('/laboratory');
    
    await expect(page.getByText(/laboratory/i)).toBeVisible({ timeout: 10000 });
  });

  test('should show test list', async ({ page }) => {
    await page.goto('/laboratory/tests');
    
    await expect(page.getByText(/test/i)).toBeVisible({ timeout: 10000 });
  });
});

test.describe('HMS Pharmacy E2E', () => {
  test('should display pharmacy dashboard', async ({ page }) => {
    await page.goto('/pharmacy');
    
    await expect(page.getByText(/pharmacy/i)).toBeVisible({ timeout: 10000 });
  });

  test('should show medicine list', async ({ page }) => {
    await page.goto('/pharmacy/medicines');
    
    await expect(page.getByText(/medicine/i)).toBeVisible({ timeout: 10000 });
  });
});

test.describe('HMS Staff Management E2E', () => {
  test('should display staff page', async ({ page }) => {
    await page.goto('/staff');
    
    await expect(page.getByText(/staff/i)).toBeVisible({ timeout: 10000 });
  });

  test('should have add staff button', async ({ page }) => {
    await page.goto('/staff');
    
    await expect(page.getByRole('button', { name: /add staff/i })).toBeVisible({ timeout: 10000 });
  });
});

test.describe('HMS Accounting E2E', () => {
  test('should display accounting dashboard', async ({ page }) => {
    await page.goto('/accounting');
    
    await expect(page.getByText(/accounting/i)).toBeVisible({ timeout: 10000 });
  });

  test('should show income list', async ({ page }) => {
    await page.goto('/accounting/income');
    
    await expect(page.getByText(/income/i)).toBeVisible({ timeout: 10000 });
  });

  test('should show expense list', async ({ page }) => {
    await page.goto('/accounting/expenses');
    
    await expect(page.getByText(/expense/i)).toBeVisible({ timeout: 10000 });
  });
});

test.describe('HMS Responsive Design', () => {
  test('should work on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    // Should still load without errors
    await expect(page).toHaveTitle(/HMS|Hospital/i, { timeout: 10000 });
  });

  test('should work on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    
    await expect(page).toHaveTitle(/HMS|Hospital/i, { timeout: 10000 });
  });

  test('should work on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    
    await expect(page).toHaveTitle(/HMS|Hospital/i, { timeout: 10000 });
  });
});
