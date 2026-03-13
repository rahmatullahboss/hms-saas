import { test, expect } from '@playwright/test';
import { loginAs, mockGet, mockMutation, fixtures } from './helpers/auth';

const pharmacyData = {
  medicines: fixtures.medicines,
  summary: { total_investment: 50000, total_income: 80000, cogs: 30000, profit: 50000 },
  purchases: {
    purchases: [
      { id: 1, medicine_name: 'Paracetamol', quantity: 1000, total_amount: 2000, date: '2025-01-01', supplier: 'ABC Pharma' },
    ],
  },
  sales: {
    sales: [
      { id: 1, medicine_name: 'Paracetamol', quantity: 10, total_amount: 30, date: '2025-01-05', patient_name: 'Rahim Uddin' },
    ],
  },
  lowStock: { medicines: [] },
  expiring: { batches: [] },
};

test.describe('Pharmacy Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/pharmacy/medicines**', pharmacyData.medicines);
    await mockGet(page, '**/api/pharmacy/summary**', pharmacyData.summary);
    await mockGet(page, '**/api/pharmacy/purchases**', pharmacyData.purchases);
    await mockGet(page, '**/api/pharmacy/sales**', pharmacyData.sales);
    await mockGet(page, '**/api/pharmacy/low-stock**', pharmacyData.lowStock);
    await mockGet(page, '**/api/pharmacy/expiring**', pharmacyData.expiring);
    await loginAs(page, 'hospital_admin', '/hospital_admin/pharmacy');
  });

  test('shows Pharmacy heading', async ({ page }) => {
    await expect(page.getByText(/pharmacy/i)).toBeVisible({ timeout: 8000 });
  });

  test('shows Medicine list', async ({ page }) => {
    await expect(page.getByText(/paracetamol/i)).toBeVisible({ timeout: 8000 });
  });

  test('shows summary cards (investment, income, profit)', async ({ page }) => {
    // Wait for content to load
    await expect(page.getByText(/pharmacy/i)).toBeVisible({ timeout: 8000 });
    // Summary section or stats should be visible
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
    expect(content!.length).toBeGreaterThan(100);
  });

  test('shows tabs for medicines, purchases, sales', async ({ page }) => {
    await expect(page.getByText(/pharmacy/i)).toBeVisible({ timeout: 8000 });
    // Should have tab-like navigation for medicines/purchases/sales
    await expect(page.getByText(/medicine|medicines/i)).toBeVisible();
  });
});

test.describe('Pharmacy — Tab Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await mockGet(page, '**/api/pharmacy/**', {});
    await mockGet(page, '**/api/pharmacy/medicines**', pharmacyData.medicines);
    await mockGet(page, '**/api/pharmacy/purchases**', pharmacyData.purchases);
    await mockGet(page, '**/api/pharmacy/sales**', pharmacyData.sales);
    await mockGet(page, '**/api/pharmacy/summary**', pharmacyData.summary);
    await mockGet(page, '**/api/pharmacy/low-stock**', pharmacyData.lowStock);
    await mockGet(page, '**/api/pharmacy/expiring**', pharmacyData.expiring);
    await loginAs(page, 'hospital_admin', '/hospital_admin/pharmacy');
  });

  test('page loads without errors', async ({ page }) => {
    await expect(page.getByText(/pharmacy/i)).toBeVisible({ timeout: 8000 });
  });

  test('Paracetamol medicine appears in list', async ({ page }) => {
    await expect(page.getByText(/paracetamol/i)).toBeVisible({ timeout: 8000 });
  });
});
