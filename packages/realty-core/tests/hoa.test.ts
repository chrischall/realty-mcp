import { describe, it, expect, vi, afterEach } from 'vitest';
import { hoaToMonthlyUsd } from '../src/hoa.js';

describe('hoaToMonthlyUsd', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('MLS enum vocabulary (each frequency)', () => {
    it('passes Monthly through unchanged', () => {
      expect(hoaToMonthlyUsd(250, 'Monthly')).toBe(250);
    });

    it('divides Annually by 12', () => {
      expect(hoaToMonthlyUsd(1200, 'Annually')).toBe(100);
    });

    it('divides Quarterly by 3', () => {
      expect(hoaToMonthlyUsd(300, 'Quarterly')).toBe(100);
    });

    it('divides SemiAnnually by 6', () => {
      expect(hoaToMonthlyUsd(600, 'SemiAnnually')).toBe(100);
    });

    it('converts Weekly via *52/12', () => {
      // 100/week -> 100*52/12 = 433.33 -> rounds to 433
      expect(hoaToMonthlyUsd(100, 'Weekly')).toBe(433);
    });

    it('rounds to the nearest dollar', () => {
      // 1000/year -> 83.33 -> 83
      expect(hoaToMonthlyUsd(1000, 'Annually')).toBe(83);
    });
  });

  describe('loose DOM-string forms (homes-mcp defensive variant)', () => {
    it('accepts "/ month" suffix', () => {
      expect(hoaToMonthlyUsd(250, '$250 / month')).toBe(250);
      expect(hoaToMonthlyUsd(250, '/month')).toBe(250);
    });

    it('accepts "per month"', () => {
      expect(hoaToMonthlyUsd(250, 'per month')).toBe(250);
    });

    it('accepts "annual" / "yearly" / "/ year"', () => {
      expect(hoaToMonthlyUsd(1200, 'annually')).toBe(100);
      expect(hoaToMonthlyUsd(1200, 'Yearly')).toBe(100);
      expect(hoaToMonthlyUsd(1200, '$1200 / year')).toBe(100);
    });

    it('accepts "quarter" / "/ quarter"', () => {
      expect(hoaToMonthlyUsd(300, 'quarterly')).toBe(100);
      expect(hoaToMonthlyUsd(300, '/ quarter')).toBe(100);
    });

    it('accepts "semi-annual" / "bi-annual"', () => {
      expect(hoaToMonthlyUsd(600, 'Semi-Annually')).toBe(100);
      expect(hoaToMonthlyUsd(600, 'bi-annual')).toBe(100);
    });

    it('accepts "week" / "/ week"', () => {
      expect(hoaToMonthlyUsd(100, 'weekly')).toBe(433);
      expect(hoaToMonthlyUsd(100, '/ week')).toBe(433);
    });

    it('is case- and whitespace-tolerant', () => {
      expect(hoaToMonthlyUsd(250, '  MONTHLY  ')).toBe(250);
    });
  });

  describe('null-safe', () => {
    it('returns null for missing amount', () => {
      expect(hoaToMonthlyUsd(undefined, 'Monthly')).toBeNull();
      expect(hoaToMonthlyUsd(null, 'Monthly')).toBeNull();
    });

    it('returns null for a zero amount', () => {
      expect(hoaToMonthlyUsd(0, 'Monthly')).toBeNull();
    });

    it('returns null for non-finite amount', () => {
      expect(hoaToMonthlyUsd(NaN, 'Monthly')).toBeNull();
      expect(hoaToMonthlyUsd(Infinity, 'Monthly')).toBeNull();
    });

    it('returns null for missing frequency', () => {
      expect(hoaToMonthlyUsd(250, undefined)).toBeNull();
      expect(hoaToMonthlyUsd(250, null)).toBeNull();
      expect(hoaToMonthlyUsd(250, '')).toBeNull();
    });

    it('returns null (with a stderr warning) for an unparseable frequency', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(hoaToMonthlyUsd(250, 'per fortnight')).toBeNull();
      expect(spy).toHaveBeenCalledOnce();
    });
  });
});
