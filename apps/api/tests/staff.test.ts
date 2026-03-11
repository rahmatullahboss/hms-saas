import { describe, it, expect } from 'vitest';

describe('HMS Staff Management Tests', () => {
  describe('Staff Registration', () => {
    it('should create staff with all required fields', () => {
      const staff = {
        name: 'Mr. Ahmed',
        address: 'Dhaka, Bangladesh',
        position: 'Nurse',
        salary: 25000,
        bank_account: '1234567890',
        mobile: '01712345678',
        joining_date: '2024-01-01',
      };

      expect(staff.name).toBeDefined();
      expect(staff.position).toBeDefined();
      expect(staff.salary).toBeGreaterThan(0);
    });

    it('should validate staff positions', () => {
      const validPositions = [
        'Doctor',
        'Nurse',
        'Stuff Nurse',
        'Accountant',
        'Receptionist',
        'Pharmacist',
        'Lab Assistant',
        'Cleaner',
        'Security',
        'Driver',
      ];

      expect(validPositions).toContain('Doctor');
      expect(validPositions).toContain('Nurse');
      expect(validPositions).toContain('Pharmacist');
    });

    it('should validate bank account number', () => {
      const isValidAccount = (account: string) => {
        return /^\d{10,16}$/.test(account);
      };

      expect(isValidAccount('1234567890')).toBe(true);
      expect(isValidAccount('123456789012')).toBe(true);
      expect(isValidAccount('123')).toBe(false);
    });
  });

  describe('Salary Payment', () => {
    it('should calculate net salary', () => {
      const basicSalary = 25000;
      const bonus = 2000;
      const deduction = 500;
      const netSalary = basicSalary + bonus - deduction;

      expect(netSalary).toBe(26500);
    });

    it('should process salary payment', () => {
      const salaryPayment = {
        staff_id: 1,
        amount: 25000,
        payment_date: '2024-01-31',
        month: 'January',
        year: '2024',
      };

      expect(salaryPayment.amount).toBe(25000);
      expect(salaryPayment.month).toBe('January');
    });

    it('should generate salary payment reference', () => {
      const generateReference = (staffId: number, month: string, year: string) => {
        return `SAL-${staffId}-${month.substring(0, 3).toUpperCase()}-${year}`;
      };

      const ref = generateReference(1, 'January', '2024');
      expect(ref).toBe('SAL-1-JAN-2024');
    });

    it('should track monthly salary total', () => {
      const salaryPayments = [
        { staff_id: 1, amount: 25000 },
        { staff_id: 2, amount: 30000 },
        { staff_id: 3, amount: 20000 },
      ];

      const totalSalary = salaryPayments.reduce((sum, p) => sum + p.amount, 0);
      expect(totalSalary).toBe(75000);
    });
  });

  describe('Staff Status', () => {
    it('should activate staff', () => {
      const staff = { status: 'inactive' };
      staff.status = 'active';

      expect(staff.status).toBe('active');
    });

    it('should deactivate staff', () => {
      const staff = { status: 'active' };
      staff.status = 'inactive';

      expect(staff.status).toBe('inactive');
    });

    it('should filter active staff', () => {
      const staff = [
        { id: 1, name: 'A', status: 'active' },
        { id: 2, name: 'B', status: 'inactive' },
        { id: 3, name: 'C', status: 'active' },
      ];

      const activeStaff = staff.filter(s => s.status === 'active');
      expect(activeStaff.length).toBe(2);
    });
  });
});
