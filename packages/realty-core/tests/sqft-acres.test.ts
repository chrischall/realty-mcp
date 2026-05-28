import { describe, it, expect } from 'vitest';
import { sqftToAcres, SQFT_PER_ACRE } from '../src/sqft-acres.js';

describe('sqftToAcres', () => {
  it('exposes the US survey-acre constant', () => {
    expect(SQFT_PER_ACRE).toBe(43_560);
  });

  it('converts the round-4 field-report cases, rounded to 2 dp', () => {
    // The three hand-conversions from the round-4 report.
    expect(sqftToAcres(45_738)).toBe(1.05);
    expect(sqftToAcres(13_503)).toBe(0.31);
    expect(sqftToAcres(94_089)).toBe(2.16);
  });

  it('rounds to 2 decimals (half-up at the cent)', () => {
    // 43560 sqft is exactly 1 acre.
    expect(sqftToAcres(43_560)).toBe(1);
    // 21780 = 0.5 acre exactly.
    expect(sqftToAcres(21_780)).toBe(0.5);
    // 218 sqft = 0.005004… acre -> rounds to 0.01.
    expect(sqftToAcres(218)).toBe(0.01);
  });

  it('returns null (never 0) for missing / non-positive / non-finite input', () => {
    expect(sqftToAcres(null)).toBeNull();
    expect(sqftToAcres(undefined)).toBeNull();
    expect(sqftToAcres(0)).toBeNull();
    expect(sqftToAcres(-100)).toBeNull();
    expect(sqftToAcres(NaN)).toBeNull();
    expect(sqftToAcres(Infinity)).toBeNull();
  });

  it('does not collapse a tiny-but-real lot to null', () => {
    // 100 sqft is a real (if tiny) lot -> 0.0023 acre -> rounds to 0,
    // but the value is positive so it must NOT be null. round(0.0023,2)
    // is 0 — acceptable as a rounded display value, distinct from the
    // null "no lot" sentinel.
    expect(sqftToAcres(100)).toBe(0);
  });
});
