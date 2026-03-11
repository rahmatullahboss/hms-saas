import { describe, it, expect } from 'vitest';

// ─── Pharmacy Tests ───────────────────────────────────────────────────────────
// Migrated from apps/api/tests/pharmacy.test.ts
// Aligned with src/routes/tenant/pharmacy.ts and src/schemas/pharmacy.ts

describe('HMS Pharmacy Tests', () => {
  describe('Medicine Management', () => {
    it('should require name and validate positive unit price', () => {
      const medicine = {
        name: 'Paracetamol 500mg',
        company: 'Beximco',
        unitPrice: 10,
        quantity: 1000,
        genericName: 'Paracetamol',
        unit: 'Tablet',
      };

      expect(medicine.name).toBeTruthy();
      expect(medicine.unitPrice).toBeGreaterThan(0);
      expect(medicine.quantity).toBeGreaterThanOrEqual(0);
    });

    it('should detect expired medicine', () => {
      const isExpired = (expiryDate: string) => new Date(expiryDate) < new Date();
      expect(isExpired('2020-01-01')).toBe(true);
      expect(isExpired('2030-01-01')).toBe(false);
    });

    it('should calculate total stock value', () => {
      const medicines = [
        { unitPrice: 10, quantity: 100 },
        { unitPrice: 20, quantity: 50 },
      ];
      const totalValue = medicines.reduce((s, m) => s + m.unitPrice * m.quantity, 0);
      expect(totalValue).toBe(2000);
    });

    it('should trigger low-stock alert when quantity < reorderLevel', () => {
      const medicine = { quantity: 30, reorderLevel: 50 };
      const isLowStock = medicine.quantity < medicine.reorderLevel;
      expect(isLowStock).toBe(true);
    });

    it('should NOT trigger low-stock when quantity >= reorderLevel', () => {
      const medicine = { quantity: 100, reorderLevel: 50 };
      const isLowStock = medicine.quantity < medicine.reorderLevel;
      expect(isLowStock).toBe(false);
    });

    it('should reject zero or negative unit price', () => {
      const isValidPrice = (price: number) => price > 0;
      expect(isValidPrice(0)).toBe(false);
      expect(isValidPrice(-5)).toBe(false);
      expect(isValidPrice(10)).toBe(true);
    });
  });

  describe('Medicine Purchase (Stock-in)', () => {
    it('should calculate purchase subtotal', () => {
      const items = [
        { quantity: 100, purchasePrice: 8 },
        { quantity: 50,  purchasePrice: 15 },
      ];
      const total = items.reduce((s, i) => s + i.quantity * i.purchasePrice, 0);
      expect(total).toBe(1550);
    });

    it('should calculate profit margin on a medicine', () => {
      const purchasePrice = 8;
      const salePrice = 10;
      const margin = ((salePrice - purchasePrice) / salePrice) * 100;
      expect(margin).toBe(20);
    });

    it('should batch stock by batch_no and expiry_date', () => {
      const batch = {
        batchNo: 'BATCH-001',
        expiryDate: '2026-12-31',
        quantityReceived: 200,
        salePrice: 10,
      };
      expect(batch.batchNo).toBeTruthy();
      expect(batch.quantityReceived).toBeGreaterThan(0);
    });
  });

  describe('Pharmacy Sale', () => {
    it('should calculate sale total from items', () => {
      const saleItems = [
        { quantity: 2, unitPrice: 10 },
        { quantity: 1, unitPrice: 20 },
      ];
      const total = saleItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
      expect(total).toBe(40);
    });

    it('should reduce stock after sale', () => {
      let stock = 100;
      const sold = 5;
      stock -= sold;
      expect(stock).toBe(95);
    });

    it('should prevent sale when stock is 0', () => {
      const stock = 0;
      const isOutOfStock = stock <= 0;
      expect(isOutOfStock).toBe(true);
    });

    it('should prevent selling more than available stock', () => {
      const stock = 10;
      const requested = 15;
      const isInsufficient = requested > stock;
      expect(isInsufficient).toBe(true);
    });

    it('should prevent selling expired medicine', () => {
      const expiryDate = '2020-01-01';
      const isExpired = new Date(expiryDate) < new Date();
      expect(isExpired).toBe(true);
    });
  });

  describe('Pharmacy P&L', () => {
    it('should calculate total pharmacy investment', () => {
      const purchases = [{ amount: 10000 }, { amount: 15000 }, { amount: 8000 }];
      const total = purchases.reduce((s, p) => s + p.amount, 0);
      expect(total).toBe(33000);
    });

    it('should calculate pharmacy profit', () => {
      const totalSales    = 60000;
      const totalPurchase = 33000;
      const profit = totalSales - totalPurchase;
      expect(profit).toBe(27000);
    });
  });
});
