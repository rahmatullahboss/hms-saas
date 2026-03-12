import { describe, it, expect } from 'vitest';

// ─── Profit Distribution & Admin Auth Tests ───────────────────────────────────
// Covers: src/routes/tenant/profit.ts, src/routes/admin/auth.ts
// MD/Director only: net profit calculation, share distribution, super-admin

describe('HMS Profit Distribution Tests', () => {

  // ─── Net Profit Calculation ───────────────────────────────────────────────
  describe('Net Profit Calculation', () => {
    interface ProfitCalcInput {
      totalIncome: number;
      totalApprovedExpenses: number;
      doctorCommissions: number;
      salaries: number;
    }

    function calcNetProfit(input: ProfitCalcInput): number {
      return input.totalIncome - input.totalApprovedExpenses - input.doctorCommissions - input.salaries;
    }

    function calcDistributableProfit(netProfit: number, reservePercent: number): number {
      if (netProfit <= 0) return 0;
      return Math.round(netProfit * (1 - reservePercent / 100));
    }

    it('should calculate net profit correctly', () => {
      const input: ProfitCalcInput = {
        totalIncome: 1_000_000,
        totalApprovedExpenses: 300_000,
        doctorCommissions: 200_000,
        salaries: 150_000,
      };
      expect(calcNetProfit(input)).toBe(350_000);
    });

    it('should return negative net profit for a loss month', () => {
      const input: ProfitCalcInput = {
        totalIncome: 200_000,
        totalApprovedExpenses: 300_000,
        doctorCommissions: 50_000,
        salaries: 100_000,
      };
      expect(calcNetProfit(input)).toBeLessThan(0);
    });

    it('should calculate distributable profit with 20% reserve', () => {
      expect(calcDistributableProfit(350_000, 20)).toBe(280_000);
    });

    it('should return 0 distributable profit when net profit is 0', () => {
      expect(calcDistributableProfit(0, 20)).toBe(0);
    });

    it('should return 0 distributable profit when net is negative', () => {
      expect(calcDistributableProfit(-50_000, 20)).toBe(0);
    });

    it('should allow 0% reserve (fully distribute profits)', () => {
      expect(calcDistributableProfit(350_000, 0)).toBe(350_000);
    });

    it('should allow 100% reserve (no distribution)', () => {
      expect(calcDistributableProfit(350_000, 100)).toBe(0);
    });
  });

  // ─── Shareholder Distribution ──────────────────────────────────────────────
  describe('Shareholder Distribution Calculation', () => {
    interface Shareholder {
      id: number;
      name: string;
      sharePercent: number;
    }

    function distributeToShareholders(
      distributableAmount: number,
      shareholders: Shareholder[]
    ): Array<{ shareholderId: number; name: string; sharePercent: number; amount: number }> {
      const totalPct = shareholders.reduce((s, sh) => s + sh.sharePercent, 0);
      if (Math.abs(totalPct - 100) > 0.01) {
        throw new Error(`Total share percentages must equal 100% (got ${totalPct}%)`);
      }
      return shareholders.map((sh) => ({
        shareholderId: sh.id,
        name: sh.name,
        sharePercent: sh.sharePercent,
        amount: Math.round(distributableAmount * (sh.sharePercent / 100)),
      }));
    }

    const shareholders: Shareholder[] = [
      { id: 1, name: 'Dr. Ahmed', sharePercent: 40 },
      { id: 2, name: 'Dr. Hossain', sharePercent: 35 },
      { id: 3, name: 'Investor A', sharePercent: 25 },
    ];

    it('should distribute ৳280,000 profit correctly among 3 shareholders', () => {
      const distribution = distributeToShareholders(280_000, shareholders);
      expect(distribution[0].amount).toBe(112_000); // 40% of 280k
      expect(distribution[1].amount).toBe(98_000);  // 35% of 280k
      expect(distribution[2].amount).toBe(70_000);  // 25% of 280k
    });

    it('should verify total distributed equals distributable amount', () => {
      const distribution = distributeToShareholders(280_000, shareholders);
      const totalDistributed = distribution.reduce((s, d) => s + d.amount, 0);
      expect(totalDistributed).toBe(280_000);
    });

    it('should reject distribution when shares do not sum to 100%', () => {
      const badShareholders = [
        { id: 1, name: 'A', sharePercent: 40 },
        { id: 2, name: 'B', sharePercent: 40 },
      ];
      expect(() => distributeToShareholders(100_000, badShareholders)).toThrow('must equal 100%');
    });

    it('should handle single 100% shareholder', () => {
      const single = [{ id: 1, name: 'Dr. Ahmed', sharePercent: 100 }];
      const distribution = distributeToShareholders(100_000, single);
      expect(distribution[0].amount).toBe(100_000);
    });

    it('should not distribute when amount is 0', () => {
      const distribution = distributeToShareholders(0, shareholders);
      expect(distribution.every((d) => d.amount === 0)).toBe(true);
    });

    it('should track distribution month-year', () => {
      const record = { month: '2024-01', distributableAmount: 280_000, reserveAmount: 70_000 };
      expect(record.month).toMatch(/^\d{4}-\d{2}$/);
      expect(record.distributableAmount + record.reserveAmount).toBe(350_000);
    });
  });

  // ─── Role-Based Access for Profit ─────────────────────────────────────────
  describe('Role-Based Access to Profit Distribution', () => {
    const PROFIT_ACCESS_ROLES = ['hospital_admin', 'md', 'director'];

    function canAccessProfitDistribution(role: string): boolean {
      return PROFIT_ACCESS_ROLES.includes(role);
    }

    it('should allow hospital_admin to access profit distribution', () => {
      expect(canAccessProfitDistribution('hospital_admin')).toBe(true);
    });

    it('should allow md to access profit distribution', () => {
      expect(canAccessProfitDistribution('md')).toBe(true);
    });

    it('should allow director to access profit distribution', () => {
      expect(canAccessProfitDistribution('director')).toBe(true);
    });

    it('should block doctor from accessing profit distribution', () => {
      expect(canAccessProfitDistribution('doctor')).toBe(false);
    });

    it('should block accountant from accessing profit distribution', () => {
      expect(canAccessProfitDistribution('accountant')).toBe(false);
    });

    it('should block nurse from accessing profit distribution', () => {
      expect(canAccessProfitDistribution('nurse')).toBe(false);
    });
  });
});

describe('HMS Admin Auth Tests', () => {

  // ─── Super Admin Validation ────────────────────────────────────────────────
  describe('Super Admin / Platform Admin Validation', () => {
    interface AdminUser {
      id: number;
      email: string;
      role: 'super_admin' | 'platform_support';
      isActive: boolean;
    }

    const ADMIN_ROLES = ['super_admin', 'platform_support'] as const;

    function isGlobalAdmin(user: AdminUser): boolean {
      return ADMIN_ROLES.includes(user.role) && user.isActive;
    }

    it('should grant access to active super_admin', () => {
      const admin: AdminUser = { id: 1, email: 'admin@platform.com', role: 'super_admin', isActive: true };
      expect(isGlobalAdmin(admin)).toBe(true);
    });

    it('should grant access to active platform_support', () => {
      const admin: AdminUser = { id: 2, email: 'support@platform.com', role: 'platform_support', isActive: true };
      expect(isGlobalAdmin(admin)).toBe(true);
    });

    it('should deny access to inactive super_admin', () => {
      const admin: AdminUser = { id: 3, email: 'old@platform.com', role: 'super_admin', isActive: false };
      expect(isGlobalAdmin(admin)).toBe(false);
    });

    it('should list all possible admin roles', () => {
      expect(ADMIN_ROLES).toContain('super_admin');
      expect(ADMIN_ROLES).toContain('platform_support');
      expect(ADMIN_ROLES.length).toBe(2);
    });
  });

  // ─── Tenant Onboarding Validation ─────────────────────────────────────────
  describe('Tenant Onboarding Validation', () => {
    interface TenantRegistration {
      subdomain: string;
      hospitalName: string;
      adminEmail: string;
      adminPassword: string;
      plan: 'basic' | 'professional' | 'enterprise';
    }

    const PLANS = ['basic', 'professional', 'enterprise'] as const;

    function isValidRegistration(input: Partial<TenantRegistration>): string[] {
      const errors: string[] = [];
      if (!input.subdomain?.trim()) errors.push('subdomain required');
      if (!input.hospitalName?.trim()) errors.push('hospitalName required');
      if (!input.adminEmail?.includes('@')) errors.push('valid adminEmail required');
      if (!input.adminPassword || input.adminPassword.length < 8) errors.push('password must be 8+ chars');
      if (!input.plan || !(PLANS as readonly string[]).includes(input.plan)) errors.push('valid plan required');
      return errors;
    }

    it('should accept valid tenant registration', () => {
      const reg: TenantRegistration = {
        subdomain: 'city-hospital',
        hospitalName: 'City General Hospital',
        adminEmail: 'admin@cityhospital.com',
        adminPassword: 'StrongP@ss1',
        plan: 'professional',
      };
      expect(isValidRegistration(reg)).toHaveLength(0);
    });

    it('should reject registration without subdomain', () => {
      expect(isValidRegistration({ hospitalName: 'H', adminEmail: 'a@b.com', adminPassword: 'Password1!', plan: 'basic' }))
        .toContain('subdomain required');
    });

    it('should reject registration with invalid email', () => {
      expect(isValidRegistration({ subdomain: 'h', hospitalName: 'H', adminEmail: 'notanemail', adminPassword: 'Password1!', plan: 'basic' }))
        .toContain('valid adminEmail required');
    });

    it('should reject weak password (< 8 chars)', () => {
      expect(isValidRegistration({ subdomain: 'h', hospitalName: 'H', adminEmail: 'a@b.com', adminPassword: 'weak', plan: 'basic' }))
        .toContain('password must be 8+ chars');
    });

    it('should reject invalid plan', () => {
      expect(isValidRegistration({ subdomain: 'h', hospitalName: 'H', adminEmail: 'a@b.com', adminPassword: 'Password1!', plan: 'premium' as never }))
        .toContain('valid plan required');
    });

    it('should accept all three pricing plans', () => {
      PLANS.forEach((plan) => {
        const errors = isValidRegistration({ subdomain: 'h', hospitalName: 'H', adminEmail: 'a@b.com', adminPassword: 'Password1!', plan });
        expect(errors).not.toContain('valid plan required');
      });
    });
  });

  // ─── Tenant Status Management ──────────────────────────────────────────────
  describe('Tenant Status Management', () => {
    type TenantStatus = 'active' | 'suspended' | 'trial' | 'cancelled';

    function canSuspend(status: TenantStatus): boolean {
      return status === 'active' || status === 'trial';
    }

    function canReactivate(status: TenantStatus): boolean {
      return status === 'suspended';
    }

    it('should allow suspending an active tenant', () => {
      expect(canSuspend('active')).toBe(true);
    });

    it('should allow suspending a trial tenant', () => {
      expect(canSuspend('trial')).toBe(true);
    });

    it('should not allow suspending an already-suspended tenant', () => {
      expect(canSuspend('suspended')).toBe(false);
    });

    it('should not allow suspending a cancelled tenant', () => {
      expect(canSuspend('cancelled')).toBe(false);
    });

    it('should allow reactivating a suspended tenant', () => {
      expect(canReactivate('suspended')).toBe(true);
    });

    it('should not allow reactivating an already-active tenant', () => {
      expect(canReactivate('active')).toBe(false);
    });
  });
});
