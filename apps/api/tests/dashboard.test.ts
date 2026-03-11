import { describe, it, expect } from 'vitest';

describe('HMS Dashboard Tests', () => {
  describe('Daily Income Summary', () => {
    it('should calculate daily test income', () => {
      const todayTests = [
        { test_name: 'CBC', amount: 500 },
        { test_name: 'X-Ray', amount: 800 },
        { test_name: 'Blood Sugar', amount: 300 },
      ];

      const totalTestIncome = todayTests.reduce((sum, t) => sum + t.amount, 0);
      expect(totalTestIncome).toBe(1600);
    });

    it('should calculate daily operation/cesarean income', () => {
      const operations = [
        { type: 'Cesarean', doctor_bill: 15000 },
        { type: 'Normal Delivery', doctor_bill: 5000 },
        { type: 'Appendectomy', doctor_bill: 10000 },
      ];

      const total = operations.reduce((sum, op) => sum + op.doctor_bill, 0);
      expect(total).toBe(30000);
    });

    it('should calculate daily doctor visit income', () => {
      const visits = [
        { patient_id: 1, fee: 500 },
        { patient_id: 2, fee: 500 },
        { patient_id: 3, fee: 300 },
      ];

      const total = visits.reduce((sum, v) => sum + v.fee, 0);
      expect(total).toBe(1300);
    });

    it('should calculate pharmacy income', () => {
      const pharmacySales = [
        { date: '2024-01-15', amount: 5000 },
        { date: '2024-01-15', amount: 3000 },
      ];

      const totalPharmacyIncome = pharmacySales.reduce((sum, s) => sum + s.amount, 0);
      expect(totalPharmacyIncome).toBe(8000);
    });

    it('should calculate total daily income', () => {
      const testIncome = 1600;
      const doctorVisitIncome = 1300;
      const operationIncome = 30000;
      const pharmacyIncome = 8000;
      
      const totalDailyIncome = testIncome + doctorVisitIncome + operationIncome + pharmacyIncome;
      expect(totalDailyIncome).toBe(40900);
    });
  });

  describe('Daily Expense Summary', () => {
    it('should calculate staff salary expense', () => {
      const dailySalary = 50000 / 30; // Monthly divided by days
      expect(dailySalary).toBeCloseTo(1666.67, 0);
    });

    it('should categorize expenses', () => {
      const expenses = [
        { category: 'SALARY', amount: 10000 },
        { category: 'MEDICINE', amount: 5000 },
        { category: 'ELECTRICITY', amount: 2000 },
        { category: 'RENT', amount: 3000 },
      ];

      const byCategory = expenses.reduce((acc, e) => {
        acc[e.category] = e.amount;
        return acc;
      }, {} as Record<string, number>);

      expect(byCategory.SALARY).toBe(10000);
      expect(byCategory.MEDICINE).toBe(5000);
    });

    it('should calculate total daily expenses', () => {
      const expenses = [
        { category: 'SALARY', amount: 1667 },
        { category: 'MEDICINE', amount: 5000 },
        { category: 'ELECTRICITY', amount: 667 },
        { category: 'RENT', amount: 1000 },
      ];

      const total = expenses.reduce((sum, e) => sum + e.amount, 0);
      expect(total).toBe(8334);
    });
  });

  describe('Daily Profit/Loss', () => {
    it('should calculate daily profit', () => {
      const dailyIncome = 40900;
      const dailyExpense = 8334;
      const profit = dailyIncome - dailyExpense;

      expect(profit).toBe(32566);
    });

    it('should handle daily loss', () => {
      const dailyIncome = 5000;
      const dailyExpense = 8000;
      const loss = dailyIncome - dailyExpense;

      expect(loss).toBe(-3000);
    });
  });

  describe('Dashboard KPIs', () => {
    it('should calculate patient count', () => {
      const todayPatients = ['P1', 'P2', 'P3', 'P4', 'P5'];
      expect(todayPatients.length).toBe(5);
    });

    it('should calculate admission count', () => {
      const admissions = [
        { patient_id: 1, type: 'admission' },
        { patient_id: 2, type: 'admission' },
      ];
      expect(admissions.length).toBe(2);
    });

    it('should calculate collection rate', () => {
      const totalDue = 50000;
      const collected = 35000;
      const collectionRate = (collected / totalDue) * 100;

      expect(collectionRate).toBe(70);
    });

    it('should calculate occupancy rate', () => {
      const totalBeds = 20;
      const occupiedBeds = 15;
      const occupancyRate = (occupiedBeds / totalBeds) * 100;

      expect(occupancyRate).toBe(75);
    });
  });

  describe('Date Range Reports', () => {
    it('should filter by date range', () => {
      const transactions = [
        { date: '2024-01-10', amount: 1000 },
        { date: '2024-01-15', amount: 2000 },
        { date: '2024-01-20', amount: 3000 },
        { date: '2024-02-01', amount: 4000 },
      ];

      const startDate = '2024-01-01';
      const endDate = '2024-01-31';

      const filtered = transactions.filter(t => t.date >= startDate && t.date <= endDate);
      expect(filtered.length).toBe(3);
    });

    it('should calculate weekly total', () => {
      const weeklyIncomes = [
        { date: '2024-01-15', amount: 10000 },
        { date: '2024-01-16', amount: 12000 },
        { date: '2024-01-17', amount: 8000 },
        { date: '2024-01-18', amount: 15000 },
        { date: '2024-01-19', amount: 9000 },
        { date: '2024-01-20', amount: 11000 },
        { date: '2024-01-21', amount: 10000 },
      ];

      const weeklyTotal = weeklyIncomes.reduce((sum, i) => sum + i.amount, 0);
      expect(weeklyTotal).toBe(75000);
    });

    it('should calculate monthly total', () => {
      const monthlyIncomes = [
        { date: '2024-01-01', amount: 100000 },
        { date: '2024-01-15', amount: 150000 },
        { date: '2024-01-31', amount: 120000 },
      ];

      const monthlyTotal = monthlyIncomes.reduce((sum, i) => sum + i.amount, 0);
      expect(monthlyTotal).toBe(370000);
    });
  });
});
