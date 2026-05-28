import { describe, it, expect } from 'vitest';
import { daysSince } from '../src/days-since.js';

// A fixed clock so the math is deterministic: 2026-05-28T00:00:00Z.
const NOW = Date.parse('2026-05-28T00:00:00.000Z');

describe('daysSince', () => {
  describe('ISO-string input (onehome / homes variant)', () => {
    it('floors the day count against a pinned clock', () => {
      // 10 days earlier.
      expect(daysSince('2026-05-18T00:00:00.000Z', NOW)).toBe(10);
    });

    it('floors a partial day down', () => {
      // 10 days + 23h earlier -> still floors to 10.
      expect(daysSince('2026-05-17T01:00:00.000Z', NOW)).toBe(10);
    });

    it('returns 0 for a same-day (sub-24h) timestamp', () => {
      expect(daysSince('2026-05-27T12:00:00.000Z', NOW)).toBe(0);
    });

    it('parses a bare date string', () => {
      expect(daysSince('2026-05-18', NOW)).toBe(10);
    });
  });

  describe('unix-ms input (compass daysSinceMs variant)', () => {
    it('accepts a numeric unix-ms timestamp', () => {
      const tenDaysAgo = NOW - 10 * 86_400_000;
      expect(daysSince(tenDaysAgo, NOW)).toBe(10);
    });
  });

  describe('clock injection', () => {
    it('defaults the second arg to Date.now() when omitted', () => {
      // Pin a value relative to real now so we do not depend on a frozen
      // clock: an instant 5 days before the real current time floors to 5.
      const fiveDaysAgo = Date.now() - 5 * 86_400_000 - 1000;
      expect(daysSince(fiveDaysAgo)).toBe(5);
    });
  });

  describe('future / negative (cohort returns the raw floor)', () => {
    it('returns a negative count for a future timestamp', () => {
      // Cohort impls (homes/onehome/compass) return the raw Math.floor,
      // so future dates yield negatives rather than null.
      expect(daysSince('2026-06-07T00:00:00.000Z', NOW)).toBe(-10);
    });
  });

  describe('null-safe', () => {
    it('returns null for missing input', () => {
      expect(daysSince(undefined, NOW)).toBeNull();
    });

    it('returns null for an unparseable string', () => {
      expect(daysSince('not a date', NOW)).toBeNull();
    });

    it('returns null for a non-finite numeric input', () => {
      expect(daysSince(NaN, NOW)).toBeNull();
      expect(daysSince(Infinity, NOW)).toBeNull();
    });
  });
});
