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

  it('returns WA and its neighbours for a Seattle ZIP', () => {
    const states = zipPlausibleStates('98103');
    expect(states).toContain('WA');
    expect(states).toContain('OR');
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

  it('returns true when a clear majority of homes are in-state', () => {
    expect(homesMatchZipState('28746', ['NC', 'NC', 'NC'])).toBe(true);
    // One stray out-of-state home in an otherwise in-state set still matches.
    expect(homesMatchZipState('28746', ['NC', 'NC', 'NC', 'WA'])).toBe(true);
  });

  it('rejects a mixed set where in-state homes are not a majority', () => {
    // Partially-poisoned set: a single plausible home must not rescue a
    // mostly-cross-continent result (the old "any plausible ⇒ matched" bug).
    expect(homesMatchZipState('28746', ['WA', 'WA', 'WA', 'NC'])).toBe(false);
    // An even split is not a majority → reject.
    expect(homesMatchZipState('28746', ['WA', 'NC'])).toBe(false);
  });

  it('case-folds the returned home states', () => {
    expect(homesMatchZipState('28746', ['nc'])).toBe(true);
    expect(homesMatchZipState('28746', ['nc', 'sc'])).toBe(true);
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

// fleet-audit#660: the first-digit table missed real prefixes, so correct
// in-state results were confidently rejected.
describe('zipPlausibleStates — USPS 3-digit prefixes', () => {
  it.each([
    ['00501', 'NY'], // Holtsville (IRS)
    ['00601', 'PR'],
    ['00802', 'VI'],
    ['05501', 'MA'], // Andover (IRS)
    ['20101', 'VA'], // Dulles
    ['20001', 'DC'],
    ['56901', 'DC'], // federal parcel ZIPs
    ['73301', 'TX'], // Austin (IRS)
    ['88510', 'TX'], // El Paso
    ['34002', 'AA'],
    ['09001', 'AE'],
    ['96201', 'AP'],
    ['96799', 'AS'],
    ['96910', 'GU'],
    ['96950', 'MP'],
    ['96941', 'FM'],
    ['96960', 'MH'],
    ['96940', 'PW'],
    ['99501', 'AK'],
    ['96801', 'HI'],
  ])('%s is plausible for %s', (zip, state) => {
    expect(zipPlausibleStates(zip)).toContain(state);
  });

  it('narrows to the ZIP state and its neighbours, not the whole digit band', () => {
    const states = zipPlausibleStates('28746')!;
    expect(states).toContain('NC');
    // Land neighbours stay plausible so a border ZIP is never a false alarm.
    expect(states).toContain('SC');
    expect(states).toContain('TN');
    expect(states).not.toContain('WA');
    // Seattle: Oregon (neighbour) plausible, California no longer.
    const wa = zipPlausibleStates('98103')!;
    expect(wa).toContain('WA');
    expect(wa).toContain('OR');
    expect(wa).not.toContain('CA');
  });

  it('keeps cross-border ZIPs plausible for both states', () => {
    // 42223 Fort Campbell straddles KY / TN.
    expect(zipPlausibleStates('42223')).toContain('TN');
    // 89439 straddles NV / CA.
    expect(zipPlausibleStates('89439')).toContain('CA');
  });

  it('returns null (no confident rejection) for an unassigned prefix', () => {
    expect(zipPlausibleStates('00001')).toBeNull();
    expect(zipPlausibleStates('21300')).toBeNull();
    expect(homesMatchZipState('00001', ['WA'])).toBe(true);
  });

  it('no longer rejects correct results for the previously-missing prefixes', () => {
    expect(homesMatchZipState('88510', ['TX'])).toBe(true);
    expect(homesMatchZipState('00501', ['NY'])).toBe(true);
    expect(homesMatchZipState('96960', ['MH'])).toBe(true);
    expect(homesMatchZipState('56901', ['DC'])).toBe(true);
  });
});

describe('FIRST_DIGIT_TO_STATES — coarse table fixes (fleet-audit#660)', () => {
  it('includes the prefixes the old table missed', () => {
    expect(FIRST_DIGIT_TO_STATES['0']).toContain('NY');
    expect(FIRST_DIGIT_TO_STATES['5']).toContain('DC');
    expect(FIRST_DIGIT_TO_STATES['8']).toContain('TX');
    for (const s of ['FM', 'MH', 'PW']) expect(FIRST_DIGIT_TO_STATES['9']).toContain(s);
  });
});

describe('extractZipFromLocation — street numbers (fleet-audit#660)', () => {
  it('does not read a 5-digit street number as the ZIP', () => {
    expect(extractZipFromLocation('10001 Park Rd, Charlotte, NC')).toBeNull();
  });

  it('prefers the trailing ZIP over a 5-digit street number', () => {
    expect(extractZipFromLocation('10001 Park Rd, Charlotte, NC 28202')).toBe(
      '28202'
    );
    expect(
      extractZipFromLocation('12345 N Main St, Charlotte, NC 28202-1234')
    ).toBe('28202');
  });

  it('still reads a bare or trailing ZIP', () => {
    expect(extractZipFromLocation('28746')).toBe('28746');
    expect(extractZipFromLocation('28746, NC')).toBe('28746');
    expect(extractZipFromLocation('Charlotte NC 28202')).toBe('28202');
  });
});

