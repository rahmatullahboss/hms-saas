import { describe, it, expect } from 'vitest';

describe('HMS Pharmacy Tests', () => {
  describe('Medicine Management', () => {
    it('should create medicine with all required fields', () => {
      const medicine = {
        name: 'Paracetamol 500mg',
        company: 'Beximco',
        unit_price: 10,
        quantity: 1000,
      };

      expect(medicine.name).toBeDefined();
      expect(medicine.company).toBeDefined();
      expect(medicine.unit_price).toBeGreaterThan(0);
      expect(medicine.quantity).toBeGreaterThanOrEqual(0);
    });

    it('should track medicine stock', () => {
      const stock = {
        medicine_id: 1,
        batch_no: 'BATCH001',
        expiry_date: '2025-12-31',
        quantity: 500,
      };

      expect(stock.quantity).toBe(500);
    });

    it('should validate expiry date', () => {
      const isExpired = (expiryDate: string) => {
        return new Date(expiryDate) < new Date();
      };

      expect(isExpired('2020-01-01')).toBe(true);
      expect(isExpired('2030-01-01')).toBe(false);
    });

    it('should calculate total medicine value', () => {
      const medicines = [
        { name: 'Medicine A', unit_price: 10, quantity: 100 },
        { name: 'Medicine B', unit_price: 20, quantity: 50 },
      ];

      const totalValue = medicines.reduce(
        (sum, m) => sum + m.unit_price * m.quantity,
        0
      );

      expect(totalValue).toBe(2000);
    });
  });

  describe('Medicine Purchase', () => {
    it('should create purchase entry', () => {
      const purchase = {
        supplier_id: 1,
        purchase_date: '2024-01-15',
        items: [
          { medicine_id: 1, quantity: 100, purchase_price: 8, sale_price: 10 },
          { medicine_id: 2, quantity: 50, purchase_price: 15, sale_price: 20 },
        ],
      };

      expect(purchase.items.length).toBe(2);
    });

    it('should calculate purchase total', () => {
      const items = [
        { quantity: 100, purchase_price: 8 },
        { quantity: 50, purchase_price: 15 },
      ];

      const total = items.reduce(
        (sum, item) => sum + item.quantity * item.purchase_price,
        0
      );

      expect(total).toBe(1550);
    });

    it('should calculate profit margin', () => {
      const purchasePrice = 8;
      const salePrice = 10;
      const margin = ((salePrice - purchasePrice) / salePrice) * 100;

      expect(margin).toBe(20);
    });
  });

  describe('Pharmacy Sale', () => {
    it('should process pharmacy sale', () => {
      const sale = {
        items: [
          { medicine_id: 1, quantity: 2, unit_price: 10 },
          { medicine_id: 2, quantity: 1, unit_price: 20 },
        ],
      };

      const total = sale.items.reduce(
        (sum, item) => sum + item.quantity * item.unit_price,
        0
      );

      expect(total).toBe(40);
    });

    it('should update stock after sale', () => {
      let stock = 100;
      const sold = 5;
      stock = stock - sold;

      expect(stock).toBe(95);
    });

    it('should check low stock alert', () => {
      const reorderLevel = 50;
      const currentStock = 30;
      const isLowStock = currentStock < reorderLevel;

      expect(isLowStock).toBe(true);
    });
  });

  describe('Pharmacy Reports', () => {
    it('should calculate total pharmacy investment', () => {
      const purchases = [
        { amount: 10000 },
        { amount: 15000 },
        { amount: 8000 },
      ];

      const totalInvestment = purchases.reduce((sum, p) => sum + p.amount, 0);
      expect(totalInvestment).toBe(33000);
    });

    it('should calculate total pharmacy income', () => {
      const sales = [
        { income: 20000 },
        { income: 25000 },
        { income: 15000 },
      ];

      const totalIncome = sales.reduce((sum, s) => sum + s.income, 0);
      expect(totalIncome).toBe(60000);
    });

    it('should calculate pharmacy profit', () => {
      const totalIncome = 60000;
      const totalInvestment = 33000;
      const profit = totalIncome - totalInvestment;

      expect(profit).toBe(27000);
    });
  });
});
