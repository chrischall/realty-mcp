import { describe, it, expect } from 'vitest';
import type { ResolverVia, ResolvedAddress } from '../src/types.js';

describe('ResolverVia', () => {
  it('covers every value used by the cohort today', () => {
    const all: ResolverVia[] = [
      'direct',
      'suffix_expansion',
      'locality_remap',
      'search_fallback',
      'autocomplete',
      'slug',
      'freetext',
      'suggestions',
    ];
    expect(all.length).toBe(8);
  });
});

describe('ResolvedAddress discriminated union', () => {
  it('narrows on resolved: true to expose url + via', () => {
    const r: ResolvedAddress = {
      resolved: true,
      url: 'https://example.com/x',
      id: 'abc',
      via: 'direct',
    };
    if (r.resolved) {
      expect(r.url).toBe('https://example.com/x');
      expect(r.via).toBe('direct');
    }
  });

  it('narrows on resolved: false to expose error', () => {
    const r: ResolvedAddress = { resolved: false, error: 'no match' };
    if (!r.resolved) {
      expect(r.error).toBe('no match');
    }
  });
});
