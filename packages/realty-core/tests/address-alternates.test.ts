import { describe, it, expect } from 'vitest';
import {
  normalizeAddressForCompare,
  collectAddressAlternates,
} from '../src/address-alternates.js';

describe('normalizeAddressForCompare', () => {
  it('lowercases', () => {
    expect(normalizeAddressForCompare('123 MAIN St')).toBe('123 main st');
  });

  it('strips commas, hashes, and periods', () => {
    expect(normalizeAddressForCompare('123 Main St., #4, Apt.')).toBe(
      '123 main st 4 apt'
    );
  });

  it('collapses runs of whitespace to a single space and trims', () => {
    expect(normalizeAddressForCompare('  123   Main    St  ')).toBe(
      '123 main st'
    );
  });

  it('returns empty string for empty / whitespace-only input', () => {
    expect(normalizeAddressForCompare('')).toBe('');
    expect(normalizeAddressForCompare('   ')).toBe('');
    expect(normalizeAddressForCompare(',#.')).toBe('');
  });

  it('treats punctuation-only differences as equal', () => {
    expect(normalizeAddressForCompare('123 Main St, #4')).toBe(
      normalizeAddressForCompare('123 main st #4')
    );
  });
});

describe('collectAddressAlternates', () => {
  it('excludes a candidate that normalize-matches the primary', () => {
    expect(
      collectAddressAlternates('123 Main St', ['123 Main St., '])
    ).toEqual([]);
  });

  it('surfaces a candidate that normalize-differs from the primary', () => {
    expect(
      collectAddressAlternates('123 Main St', ['123 Main Street'])
    ).toEqual(['123 Main Street']);
  });

  it('preserves original (un-normalized) candidate text on output', () => {
    // The OUTPUT is the verbatim candidate, not its normalized form.
    expect(
      collectAddressAlternates('123 Main St', ['456 Oak Ave., #2'])
    ).toEqual(['456 Oak Ave., #2']);
  });

  it('dedupes candidates that normalize-collide, keeping the first', () => {
    expect(
      collectAddressAlternates('123 Main St', [
        '456 Oak Ave',
        '456 Oak Ave,',
        '456  OAK   ave',
      ])
    ).toEqual(['456 Oak Ave']);
  });

  it('preserves input order across distinct alternates', () => {
    expect(
      collectAddressAlternates('1 A St', ['3 C St', '2 B St', '4 D St'])
    ).toEqual(['3 C St', '2 B St', '4 D St']);
  });

  it('skips empty / undefined / whitespace candidates', () => {
    expect(
      collectAddressAlternates('123 Main St', [
        '',
        undefined,
        '   ',
        '789 Pine Rd',
      ])
    ).toEqual(['789 Pine Rd']);
  });

  it('returns an empty array when nothing differs', () => {
    expect(collectAddressAlternates('123 Main St', [])).toEqual([]);
    expect(
      collectAddressAlternates('123 Main St', ['123 MAIN ST'])
    ).toEqual([]);
  });

  it('handles a missing / empty primary by surfacing all distinct candidates', () => {
    expect(
      collectAddressAlternates(undefined, ['123 Main St', '123 main st'])
    ).toEqual(['123 Main St']);
  });
});
