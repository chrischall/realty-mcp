import { describe, it, expect } from 'vitest';
import {
  FIRST_DIGIT_TO_STATES,
  zipPlausibleStates,
  homesMatchZipState,
  extractZipFromLocation,
} from '../src/geo.js';

describe('FIRST_DIGIT_TO_STATES', () => {
  it('maps every first digit 0-9', () => {
    for (let d = 0; d <= 9; d++) {
      expect(FIRST_DIGIT_TO_STATES[String(d)]).toBeDefined();
    }
  });

  it('places NC under the "2" prefix (28746 is a NC ZIP)', () => {
    expect(FIRST_DIGIT_TO_STATES['2']).toContain('NC');
  });

  it('places WA under the "9" prefix', () => {
    expect(FIRST_DIGIT_TO_STATES['9']).toContain('WA');
  });
});

describe('zipPlausibleStates', () => {
  it('returns NC-bearing states for a 2-prefix ZIP', () => {
    const states = zipPlausibleStates('28746');
    expect(states).not.toBeNull();
    expect(states).toContain('NC');
    expect(states).not.toContain('WA');
  });

  it('returns CA/WA-bearing states for a 9-prefix ZIP', () => {
    const states = zipPlausibleStates('98103');
    expect(states).toContain('WA');
    expect(states).toContain('CA');
  });

  it('returns NY/PA states for a 1-prefix ZIP', () => {
    const states = zipPlausibleStates('10001');
    expect(states).toContain('NY');
  });

  it('tolerates a ZIP+4 by considering the leading 5 digits', () => {
    expect(zipPlausibleStates('28746-1234')).toContain('NC');
  });

  it('returns null for a non-5-digit / non-US input', () => {
    expect(zipPlausibleStates('K1A 0B1')).toBeNull();
    expect(zipPlausibleStates('abcde')).toBeNull();
    expect(zipPlausibleStates('123')).toBeNull();
    expect(zipPlausibleStates(undefined)).toBeNull();
    expect(zipPlausibleStates(null)).toBeNull();
    expect(zipPlausibleStates('')).toBeNull();
  });
});

describe('homesMatchZipState', () => {
  it('returns true when a returned home is in a plausible state', () => {
    expect(homesMatchZipState('28746', ['NC'])).toBe(true);
    expect(homesMatchZipState('28746', ['NC', 'SC'])).toBe(true);
  });

  it('returns false for the canonical 28746-returning-Seattle bug', () => {
    // ZIP 28746 is North Carolina; Seattle homes come back as WA.
    expect(homesMatchZipState('28746', ['WA'])).toBe(false);
  });

  it('returns true when at least one home matches even if others do not', () => {
    expect(homesMatchZipState('28746', ['WA', 'NC'])).toBe(true);
  });

  it('case-folds the returned home states', () => {
    expect(homesMatchZipState('28746', ['nc'])).toBe(true);
  });

  it('does not reject when it cannot make a determination', () => {
    // Non-US ZIP → we can't pattern-match → don't claim a mismatch.
    expect(homesMatchZipState('K1A 0B1', ['WA'])).toBe(true);
    // No home states → nothing to reject.
    expect(homesMatchZipState('28746', [])).toBe(true);
    // Only empty/nullish home states → nothing to reject.
    expect(homesMatchZipState('28746', [undefined, null])).toBe(true);
  });
});

describe('extractZipFromLocation', () => {
  it('pulls a 5-digit ZIP from a free-text location', () => {
    expect(extractZipFromLocation('28746')).toBe('28746');
    expect(extractZipFromLocation('Lake Lure, NC 28746')).toBe('28746');
  });

  it('pulls the leading 5 digits of a ZIP+4', () => {
    expect(extractZipFromLocation('Seattle, WA 98103-1234')).toBe('98103');
  });

  it('returns null when there is no ZIP', () => {
    expect(extractZipFromLocation('Asheville, NC')).toBeNull();
    expect(extractZipFromLocation('')).toBeNull();
    expect(extractZipFromLocation(undefined)).toBeNull();
  });

  it('does not match a stray 5-digit run inside a longer number', () => {
    expect(extractZipFromLocation('123456')).toBeNull();
  });
});
