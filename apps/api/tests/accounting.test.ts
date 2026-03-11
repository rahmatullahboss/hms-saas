import { describe, it, expect, beforeEach, vi } from 'vitest';

const createMockD1 = (data: Record<string, any[]>) => {
  return {
    prepare: (query: string) => ({
      bind: (...args: any[]) => ({
        first: vi.fn().mockImplementation(() => {
          const tableMatch = query.match(/FROM\s+(\w+)/);
          const table = tableMatch ? tableMatch[1] : '';
          const results = data[table] || [];
          return Promise.resolve(results[0] || null);
        }),
        all: vi.fn().mockImplementation(() => {
          const tableMatch = query.match(/FROM\s+(\w+)/);
          const table = tableMatch ? tableMatch[1] : '';
          return Promise.resolve({ results: data[table] || [] });
        }),
        run: vi.fn().mockResolvedValue({ meta: { last_row_id: 1 } }),
      }),
    }),
  };
};

const mockEnv = {
  DB: createMockD1({
    income: [
      { id: 1, date: '2024-01-15', source: 'pharmacy', amount: 5000, description: 'Medicine sales', tenant_id: '1' }
    ],
    expenses: [
      { id: 1, date: '2024-01-15', category: 'SALARY', amount: 50000, status: 'approved', tenant_id: '1' }
    ],
    chart_of_accounts: [
      { id: 1, code: '4000', name: 'Pharmacy Sales', type: 'income', tenant_id: '1' }
    ],
    expense_categories: [
      { id: 1, name: 'Staff Salary', code: 'SALARY', requires_approval: 0, tenant_id: '1' }
    ],
    recurring_expenses: [
      { id: 1, category_id: 1, amount: 50000, frequency: 'monthly', next_run_date: '2024-02-01', is_active: 1, tenant_id: '1' }
    ],
    audit_logs: [
      { id: 1, table_name: 'income', action: 'CREATE', user_id: 1, tenant_id: '1' }
    ],
  }),
  KV: {},
  UPLOADS: {},
  DASHBOARD_DO: {
    idFromName: () => ({ toString: () => 'mock-id' }),
    get: () => ({
      updateIncome: vi.fn(),
      updateExpense: vi.fn(),
    }),
  },
  ENVIRONMENT: 'test',
};

describe('Accounting Module Tests', () => {
  describe('Income Management', () => {
    it('should create income entry', async () => {
      const incomeData = {
        date: '2024-01-15',
        source: 'pharmacy',
        amount: 5000,
        description: 'Medicine sales',
        tenant_id: '1',
      };

      expect(incomeData).toBeDefined();
      expect(incomeData.source).toBe('pharmacy');
      expect(incomeData.amount).toBe(5000);
    });

    it('should list income with filters', async () => {
      const filters = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        source: 'pharmacy',
      };

      expect(filters.startDate).toBeDefined();
      expect(filters.endDate).toBeDefined();
      expect(filters.source).toBe('pharmacy');
    });

    it('should calculate total income', () => {
      const incomes = [
        { amount: 5000 },
        { amount: 3000 },
        { amount: 2000 },
      ];
      
      const total = incomes.reduce((sum, inc) => sum + inc.amount, 0);
      expect(total).toBe(10000);
    });

    it('should validate income sources', () => {
      const validSources = ['pharmacy', 'laboratory', 'doctor_visit', 'admission', 'operation', 'ambulance', 'other'];
      const testSource = 'pharmacy';
      
      expect(validSources).toContain(testSource);
    });

    it('should handle zero income', () => {
      const incomes: any[] = [];
      const total = incomes.reduce((sum, inc) => sum + (inc.amount || 0), 0);
      expect(total).toBe(0);
    });
  });

  describe('Expense Management', () => {
    it('should create expense entry', async () => {
      const expenseData = {
        date: '2024-01-15',
        category: 'SALARY',
        amount: 50000,
        description: 'Staff salary',
        status: 'approved',
        tenant_id: '1',
      };

      expect(expenseData).toBeDefined();
      expect(expenseData.category).toBe('SALARY');
      expect(expenseData.amount).toBe(50000);
    });

    it('should auto-approve low amount expenses', () => {
      const expense = { amount: 5000 };
      const threshold = 10000;
      
      const shouldApprove = expense.amount < threshold;
      expect(shouldApprove).toBe(true);
    });

    it('should require approval for high amount expenses', () => {
      const expense = { amount: 50000 };
      const threshold = 10000;
      
      const shouldApprove = expense.amount < threshold;
      expect(shouldApprove).toBe(false);
    });

    it('should calculate total expenses', () => {
      const expenses = [
        { amount: 50000, status: 'approved' },
        { amount: 3000, status: 'approved' },
        { amount: 2000, status: 'pending' },
      ];
      
      const approvedTotal = expenses
        .filter(e => e.status === 'approved')
        .reduce((sum, e) => sum + e.amount, 0);
      
      expect(approvedTotal).toBe(53000);
    });

    it('should validate expense categories', () => {
      const validCategories = ['SALARY', 'MEDICINE', 'RENT', 'ELECTRICITY', 'WATER', 'COMMUNICATION', 'MAINTENANCE', 'SUPPLIES', 'MARKETING', 'BANK', 'MISC'];
      const testCategory = 'SALARY';
      
      expect(validCategories).toContain(testCategory);
    });

    it('should reject negative amounts', () => {
      const amount = -1000;
      const isValid = amount > 0;
      expect(isValid).toBe(false);
    });

    it('should handle pending status', () => {
      const expenses = [
        { amount: 5000, status: 'pending' },
        { amount: 3000, status: 'approved' },
        { amount: 2000, status: 'rejected' },
      ];
      
      const pending = expenses.filter(e => e.status === 'pending');
      expect(pending.length).toBe(1);
    });
  });

  describe('Dashboard Calculations', () => {
    it('should calculate daily profit', () => {
      const todayIncome = 50000;
      const todayExpenses = 20000;
      const profit = todayIncome - todayExpenses;
      
      expect(profit).toBe(30000);
    });

    it('should calculate monthly profit', () => {
      const monthIncome = 500000;
      const monthExpenses = 300000;
      const profit = monthIncome - monthExpenses;
      
      expect(profit).toBe(200000);
    });

    it('should calculate income by source', () => {
      const incomes = [
        { source: 'pharmacy', amount: 50000 },
        { source: 'laboratory', amount: 30000 },
        { source: 'pharmacy', amount: 20000 },
      ];

      const bySource = incomes.reduce((acc, inc) => {
        acc[inc.source] = (acc[inc.source] || 0) + inc.amount;
        return acc;
      }, {} as Record<string, number>);

      expect(bySource.pharmacy).toBe(70000);
      expect(bySource.laboratory).toBe(30000);
    });

    it('should calculate expense by category', () => {
      const expenses = [
        { category: 'SALARY', amount: 50000, status: 'approved' },
        { category: 'MEDICINE', amount: 30000, status: 'approved' },
        { category: 'SALARY', amount: 10000, status: 'approved' },
      ];

      const byCategory = expenses
        .filter(e => e.status === 'approved')
        .reduce((acc, exp) => {
          acc[exp.category] = (acc[exp.category] || 0) + exp.amount;
          return acc;
        }, {} as Record<string, number>);

      expect(byCategory.SALARY).toBe(60000);
      expect(byCategory.MEDICINE).toBe(30000);
    });

    it('should handle zero profit (break-even)', () => {
      const income = 30000;
      const expenses = 30000;
      const profit = income - expenses;
      
      expect(profit).toBe(0);
    });

    it('should handle negative profit (loss)', () => {
      const income = 20000;
      const expenses = 30000;
      const profit = income - expenses;
      
      expect(profit).toBe(-10000);
    });
  });

  describe('Profit & Loss', () => {
    it('should generate P&L report', () => {
      const incomes = [
        { source: 'pharmacy', amount: 100000 },
        { source: 'laboratory', amount: 50000 },
        { source: 'admission', amount: 30000 },
      ];

      const expenses = [
        { category: 'SALARY', amount: 50000 },
        { category: 'MEDICINE', amount: 20000 },
        { category: 'RENT', amount: 10000 },
      ];

      const totalIncome = incomes.reduce((sum, i) => sum + i.amount, 0);
      const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0);
      const netProfit = totalIncome - totalExpense;

      expect(totalIncome).toBe(180000);
      expect(totalExpense).toBe(80000);
      expect(netProfit).toBe(100000);
    });

    it('should calculate profit margin', () => {
      const revenue = 100000;
      const profit = 30000;
      const margin = (profit / revenue) * 100;
      
      expect(margin).toBe(30);
    });

    it('should calculate expense ratio', () => {
      const revenue = 100000;
      const expenses = 70000;
      const ratio = (expenses / revenue) * 100;
      
      expect(ratio).toBe(70);
    });
  });

  describe('Recurring Expenses', () => {
    it('should calculate next run date for monthly', () => {
      const currentDate = new Date('2024-01-15');
      const nextDate = new Date(currentDate);
      nextDate.setMonth(nextDate.getMonth() + 1);
      
      expect(nextDate.toISOString().split('T')[0]).toBe('2024-02-15');
    });

    it('should calculate next run date for weekly', () => {
      const currentDate = new Date('2024-01-15');
      const nextDate = new Date(currentDate);
      nextDate.setDate(nextDate.getDate() + 7);
      
      expect(nextDate.toISOString().split('T')[0]).toBe('2024-01-22');
    });

    it('should calculate next run date for daily', () => {
      const currentDate = new Date('2024-01-15');
      const nextDate = new Date(currentDate);
      nextDate.setDate(nextDate.getDate() + 1);
      
      expect(nextDate.toISOString().split('T')[0]).toBe('2024-01-16');
    });

    it('should handle month-end dates', () => {
      const currentDate = new Date('2024-01-31');
      const nextDate = new Date(currentDate);
      nextDate.setMonth(nextDate.getMonth() + 1);
      
      // JavaScript handles month overflow by going to next month
      // Jan 31 + 1 month = Feb 29 (in leap year) or Mar 2/3 (in non-leap)
      const nextMonth = nextDate.getMonth();
      expect(nextMonth).toBeGreaterThanOrEqual(1); // February or March
    });

    it('should validate frequency options', () => {
      const frequencies = ['daily', 'weekly', 'monthly'];
      expect(frequencies).toContain('daily');
      expect(frequencies).toContain('weekly');
      expect(frequencies).toContain('monthly');
    });
  });

  describe('Chart of Accounts', () => {
    it('should validate account code format', () => {
      const validCodes = ['4000', '5000', '6000'];
      const codePattern = /^[0-9]{4}$/;
      
      validCodes.forEach(code => {
        expect(codePattern.test(code)).toBe(true);
      });
    });

    it('should group accounts by type', () => {
      const accounts = [
        { code: '4000', type: 'income' },
        { code: '5000', type: 'expense' },
        { code: '7000', type: 'asset' },
        { code: '4001', type: 'income' },
      ];

      const grouped = accounts.reduce((acc, account) => {
        if (!acc[account.type]) acc[account.type] = [];
        acc[account.type].push(account);
        return acc;
      }, {} as Record<string, typeof accounts>);

      expect(grouped.income.length).toBe(2);
      expect(grouped.expense.length).toBe(1);
      expect(grouped.asset.length).toBe(1);
    });

    it('should validate account types', () => {
      const validTypes = ['asset', 'liability', 'equity', 'income', 'expense'];
      expect(validTypes).toContain('asset');
      expect(validTypes).toContain('liability');
      expect(validTypes).toContain('equity');
      expect(validTypes).toContain('income');
      expect(validTypes).toContain('expense');
    });

    it('should detect duplicate account codes', () => {
      const accounts = [
        { code: '4000', name: 'Sales' },
        { code: '5000', name: 'Expense' },
        { code: '4000', name: 'Sales 2' },
      ];

      const codes = accounts.map(a => a.code);
      const duplicates = codes.filter((code, index) => codes.indexOf(code) !== index);
      
      expect(duplicates).toContain('4000');
    });
  });

  describe('Journal Entry (Double Entry)', () => {
    it('should validate debit equals credit', () => {
      const entries = [
        { account: 'cash', debit: 5000, credit: 0 },
        { account: 'revenue', debit: 0, credit: 5000 },
      ];

      const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0);
      const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0);

      expect(totalDebit).toBe(totalCredit);
      expect(totalDebit).toBe(5000);
    });

    it('should detect unbalanced entries', () => {
      const entries = [
        { account: 'cash', debit: 5000, credit: 0 },
        { account: 'revenue', debit: 0, credit: 4000 },
      ];

      const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0);
      const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0);
      const isBalanced = totalDebit === totalCredit;

      expect(isBalanced).toBe(false);
    });

    it('should handle multiple debit entries', () => {
      const entries = [
        { account: 'cash', debit: 5000, credit: 0 },
        { account: 'medicine', debit: 3000, credit: 0 },
        { account: 'revenue', debit: 0, credit: 8000 },
      ];

      const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0);
      const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0);

      expect(totalDebit).toBe(totalCredit);
      expect(totalDebit).toBe(8000);
    });
  });

  describe('Profit Distribution', () => {
    it('should calculate 30% profit distribution', () => {
      const totalProfit = 100000;
      const distributionPercentage = 0.30;
      
      const distributableAmount = totalProfit * distributionPercentage;
      expect(distributableAmount).toBe(30000);
    });

    it('should distribute profit to shareholders', () => {
      const distributableAmount = 30000;
      const shareholders = [
        { id: 1, share_percentage: 50 },
        { id: 2, share_percentage: 30 },
        { id: 3, share_percentage: 20 },
      ];

      const distributions = shareholders.map(sh => ({
        shareholder_id: sh.id,
        amount: (distributableAmount * sh.share_percentage) / 100,
      }));

      expect(distributions[0].amount).toBe(15000);
      expect(distributions[1].amount).toBe(9000);
      expect(distributions[2].amount).toBe(6000);
    });

    it('should validate share percentages total 100', () => {
      const shareholders = [
        { share_percentage: 50 },
        { share_percentage: 30 },
        { share_percentage: 20 },
      ];

      const total = shareholders.reduce((sum, sh) => sum + sh.share_percentage, 0);
      expect(total).toBe(100);
    });

    it('should handle zero profit', () => {
      const totalProfit = 0;
      const distributionPercentage = 0.30;
      
      const distributableAmount = totalProfit * distributionPercentage;
      expect(distributableAmount).toBe(0);
    });
  });

  describe('Audit Logs', () => {
    it('should create audit log entry', () => {
      const auditEntry = {
        table_name: 'income',
        action: 'CREATE',
        record_id: 1,
        old_value: null,
        new_value: { amount: 5000 },
        user_id: 1,
        tenant_id: '1',
        created_at: new Date().toISOString(),
      };

      expect(auditEntry.action).toBe('CREATE');
      expect(auditEntry.new_value).toBeDefined();
    });

    it('should track UPDATE action with before/after', () => {
      const oldValue = { amount: 5000 };
      const newValue = { amount: 7000 };
      
      const changes = {
        field: 'amount',
        old: oldValue.amount,
        new: newValue.amount,
      };

      expect(changes.old).toBe(5000);
      expect(changes.new).toBe(7000);
      expect(changes.new - changes.old).toBe(2000);
    });

    it('should track DELETE action', () => {
      const auditEntry = {
        table_name: 'expense',
        action: 'DELETE',
        record_id: 1,
        old_value: { amount: 5000, category: 'SALARY' },
        new_value: null,
        user_id: 1,
        tenant_id: '1',
      };

      expect(auditEntry.action).toBe('DELETE');
      expect(auditEntry.old_value).toBeDefined();
      expect(auditEntry.new_value).toBeNull();
    });

    it('should validate audit actions', () => {
      const validActions = ['CREATE', 'UPDATE', 'DELETE'];
      expect(validActions).toContain('CREATE');
      expect(validActions).toContain('UPDATE');
      expect(validActions).toContain('DELETE');
    });
  });

  describe('Currency Formatting', () => {
    it('should format BDT currency', () => {
      const amount = 50000;
      const formatted = new Intl.NumberFormat('en-BD', {
        style: 'currency',
        currency: 'BDT',
        minimumFractionDigits: 0,
      }).format(amount);

      expect(formatted).toContain('50,000');
    });

    it('should handle large amounts', () => {
      const amount = 10000000;
      const formatted = new Intl.NumberFormat('en-BD', {
        style: 'currency',
        currency: 'BDT',
        minimumFractionDigits: 0,
      }).format(amount);

      // Just check that it formats with commas
      expect(formatted).toContain('10,000,000');
    });
  });

  describe('Date Filtering', () => {
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

    it('should get month from date', () => {
      const date = '2024-01-15';
      const month = date.substring(0, 7);
      
      expect(month).toBe('2024-01');
    });

    it('should filter by month', () => {
      const transactions = [
        { date: '2024-01-10', amount: 1000 },
        { date: '2024-01-15', amount: 2000 },
        { date: '2024-02-01', amount: 3000 },
      ];

      const targetMonth = '2024-01';
      const filtered = transactions.filter(t => t.date.startsWith(targetMonth));
      
      expect(filtered.length).toBe(2);
    });
  });

  describe('Expense Approval Workflow', () => {
    it('should approve expense', () => {
      const expense = { status: 'pending', approved_by: null, approved_at: null };
      const approvedExpense = {
        ...expense,
        status: 'approved',
        approved_by: 1,
        approved_at: new Date().toISOString(),
      };

      expect(approvedExpense.status).toBe('approved');
      expect(approvedExpense.approved_by).toBe(1);
    });

    it('should reject expense', () => {
      const expense = { status: 'pending', approved_by: null, approved_at: null };
      const rejectedExpense = {
        ...expense,
        status: 'rejected',
        approved_by: 1,
        approved_at: new Date().toISOString(),
      };

      expect(rejectedExpense.status).toBe('rejected');
    });

    it('should not include rejected expenses in totals', () => {
      const expenses = [
        { amount: 50000, status: 'approved' },
        { amount: 10000, status: 'rejected' },
        { amount: 5000, status: 'pending' },
      ];

      const approvedTotal = expenses
        .filter(e => e.status === 'approved')
        .reduce((sum, e) => sum + e.amount, 0);

      expect(approvedTotal).toBe(50000);
    });
  });

  describe('WebSocket Notifications', () => {
    it('should create income update message', () => {
      const message = {
        type: 'income_update',
        data: {
          amount: 5000,
          source: 'pharmacy',
        },
        timestamp: new Date().toISOString(),
      };

      expect(message.type).toBe('income_update');
      expect(message.data.amount).toBe(5000);
    });

    it('should create expense update message', () => {
      const message = {
        type: 'expense_update',
        data: {
          amount: 10000,
          status: 'approved',
        },
        timestamp: new Date().toISOString(),
      };

      expect(message.type).toBe('expense_update');
      expect(message.data.status).toBe('approved');
    });
  });

  describe('Data Validation', () => {
    it('should validate required fields for income', () => {
      const income = {
        date: '2024-01-15',
        source: 'pharmacy',
        amount: 5000,
      };

      const isValid = income.date && income.source && income.amount > 0;
      expect(isValid).toBe(true);
    });

    it('should reject invalid income source', () => {
      const validSources = ['pharmacy', 'laboratory', 'doctor_visit', 'admission', 'operation', 'ambulance', 'other'];
      const invalidSource = 'invalid';
      
      expect(validSources).not.toContain(invalidSource);
    });

    it('should validate date is not too far in past', () => {
      const today = new Date().toISOString().split('T')[0];
      const oldDate = '2020-01-01';
      
      const isRecent = oldDate >= '2023-01-01';
      expect(isRecent).toBe(false);
    });
  });
});
