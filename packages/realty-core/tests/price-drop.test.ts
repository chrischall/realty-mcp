import { describe, it, expect } from 'vitest';
import { priceDrop } from '../src/price-drop.js';

describe('priceDrop', () => {
  describe('a real drop', () => {
    it('returns { amount, percent } for a genuine price cut', () => {
      // 500000 -> 450000 = 50000 off = 10.0%
      expect(priceDrop(500_000, 450_000)).toEqual({
        amount: 50_000,
        percent: 10,
      });
    });

    it('rounds percent to one decimal (the *1000/10 trick)', () => {
      // 30000 off 525000 = 5.714...% -> 5.7
      expect(priceDrop(525_000, 495_000)).toEqual({
        amount: 30_000,
        percent: 5.7,
      });
    });
  });

  describe('no real drop', () => {
    it('returns null when current equals previous', () => {
      expect(priceDrop(500_000, 500_000)).toBeNull();
    });

    it('returns null when current exceeds previous (a raise)', () => {
      expect(priceDrop(450_000, 500_000)).toBeNull();
    });
  });

  describe('null-safe', () => {
    it('returns null when previous is missing', () => {
      expect(priceDrop(undefined, 450_000)).toBeNull();
      expect(priceDrop(null, 450_000)).toBeNull();
    });

    it('returns null when current is missing', () => {
      expect(priceDrop(500_000, undefined)).toBeNull();
      expect(priceDrop(500_000, null)).toBeNull();
    });

    it('returns null when previous is <= 0 (no division base)', () => {
      expect(priceDrop(0, -100)).toBeNull();
      expect(priceDrop(-100, -200)).toBeNull();
    });

    it('returns null for non-finite inputs', () => {
      expect(priceDrop(NaN, 450_000)).toBeNull();
      expect(priceDrop(500_000, Infinity)).toBeNull();
    });
  });
});
