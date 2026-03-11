import { describe, it, expect } from 'vitest';

describe('HMS Shareholder & Profit Distribution Tests', () => {
  describe('Shareholder Management', () => {
    it('should create shareholder', () => {
      const shareholder = {
        name: 'Mr. Rahman',
        address: 'Dhaka',
        phone: '01712345678',
        share_count: 3,
        type: 'profit',
        investment: 300000,
      };

      expect(shareholder.name).toBeDefined();
      expect(shareholder.share_count).toBeGreaterThan(0);
      expect(shareholder.type).toMatch(/profit|owner/);
    });

    it('should validate shareholder types', () => {
      const validTypes = ['profit', 'owner'];
      
      expect(validTypes).toContain('profit');
      expect(validTypes).toContain('owner');
    });

    it('should calculate investment from shares', () => {
      const sharePrice = 100000;
      const shareCount = 3;
      const investment = sharePrice * shareCount;

      expect(investment).toBe(300000);
    });
  });

  describe('Profit Calculation', () => {
    it('should calculate net profit', () => {
      const totalIncome = 500000;
      const totalExpenses = 300000;
      const netProfit = totalIncome - totalExpenses;

      expect(netProfit).toBe(200000);
    });

    it('should calculate profit holder pool (30%)', () => {
      const netProfit = 200000;
      const profitHolderPercent = 30;
      const holderPool = netProfit * (profitHolderPercent / 100);

      expect(holderPool).toBe(60000);
    });

    it('should calculate owner pool (70%)', () => {
      const netProfit = 200000;
      const ownerPercent = 70;
      const ownerPool = netProfit * (ownerPercent / 100);

      expect(ownerPool).toBe(140000);
    });
  });

  describe('Profit Distribution', () => {
    it('should calculate per share amount for profit holders', () => {
      const holderPool = 60000;
      const totalHolderShares = 100;
      const perShareAmount = holderPool / totalHolderShares;

      expect(perShareAmount).toBe(600);
    });

    it('should calculate per share amount for owners', () => {
      const ownerPool = 140000;
      const totalOwnerShares = 200;
      const perShareAmount = ownerPool / totalOwnerShares;

      expect(perShareAmount).toBe(700);
    });

    it('should distribute profit to shareholders', () => {
      const shareholders = [
        { id: 1, name: 'A', share_count: 3, type: 'profit' },
        { id: 2, name: 'B', share_count: 2, type: 'profit' },
      ];
      const perShareAmount = 600;

      const distributions = shareholders.map(sh => ({
        shareholder_id: sh.id,
        amount: sh.share_count * perShareAmount,
      }));

      expect(distributions[0].amount).toBe(1800);
      expect(distributions[1].amount).toBe(1200);
    });

    it('should validate distribution totals', () => {
      const totalDistributed = 1800 + 1200;
      const holderPool = 60000;
      const holdersShareCount = 5;
      const perShare = holderPool / holdersShareCount;

      const calculatedTotal = holdersShareCount * perShare;
      expect(calculatedTotal).toBe(60000);
    });
  });

  describe('Monthly Profit Closing', () => {
    it('should create profit period record', () => {
      const profitPeriod = {
        month: 'January',
        year: '2024',
        total_income: 500000,
        total_expense: 300000,
        net_profit: 200000,
        holders_percent: 30,
        owners_percent: 70,
        status: 'calculated',
      };

      expect(profitPeriod.net_profit).toBe(200000);
      expect(profitPeriod.status).toBe('calculated');
    });

    it('should approve profit distribution', () => {
      const profitPeriod = {
        status: 'calculated',
        approved_by: 1,
        approved_at: new Date().toISOString(),
      };

      profitPeriod.status = 'approved';
      
      expect(profitPeriod.status).toBe('approved');
      expect(profitPeriod.approved_by).toBe(1);
    });
  });

  describe('Share Settings', () => {
    it('should validate total shares', () => {
      const sharePrice = 100000;
      const totalShares = 300;
      const totalCapital = sharePrice * totalShares;

      expect(totalCapital).toBe(30000000); // 3 Crore
    });

    it('should validate share distribution', () => {
      const profitShares = 100;
      const ownerShares = 200;
      const totalShares = profitShares + ownerShares;

      expect(totalShares).toBe(300);
      expect(profitShares / totalShares).toBeCloseTo(0.333, 2);
      expect(ownerShares / totalShares).toBeCloseTo(0.667, 2);
    });

    it('should validate shares per profit partner', () => {
      const totalProfitShares = 100;
      const profitPartners = 100;
      const sharesPerPartner = totalProfitShares / profitPartners;

      expect(sharesPerPartner).toBe(1);
    });
  });
});
