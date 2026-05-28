import { describe, it, expect } from 'vitest';
import {
  SUFFIX_PAIRS,
  expandSuffix,
  compoundSplits,
  buildVariants,
} from '../src/street-variants.js';

describe('SUFFIX_PAIRS', () => {
  it('includes the high-traffic USPS pairs', () => {
    const pairs = new Map(SUFFIX_PAIRS);
    expect(pairs.get('Rd')).toBe('Road');
    expect(pairs.get('Ln')).toBe('Lane');
    expect(pairs.get('Mtn')).toBe('Mountain');
    expect(pairs.get('Hts')).toBe('Heights');
  });
});

describe('expandSuffix', () => {
  it('expands an abbreviated trailing suffix', () => {
    const variants = expandSuffix('268 Mallard Rd');
    expect(variants).toContain('268 Mallard Road');
  });

  it('contracts a full trailing suffix', () => {
    const variants = expandSuffix('268 Mallard Road');
    expect(variants).toContain('268 Mallard Rd');
  });

  it('preserves trailing remainder past the comma', () => {
    const variants = expandSuffix('268 Mallard Rd, Lake Lure NC 28746');
    expect(variants).toContain('268 Mallard Road, Lake Lure NC 28746');
  });

  it('returns empty when there is no known suffix', () => {
    expect(expandSuffix('268 Mallard')).toEqual([]);
  });
});

describe('compoundSplits', () => {
  it('produces a split variant from a compound', () => {
    const variants = compoundSplits('123 Bluebird Lane');
    expect(variants).toContain('123 Blue Bird Lane');
  });

  it('produces a join variant from a split compound', () => {
    const variants = compoundSplits('123 Blue Bird Lane');
    expect(variants).toContain('123 Bluebird Lane');
  });

  it('returns empty when nothing to split/join', () => {
    expect(compoundSplits('126 Main St')).toEqual([]);
  });
});

describe('buildVariants', () => {
  it('combines suffix + compound variants and dedups', () => {
    const variants = buildVariants('123 Bluebird Rd');
    expect(variants).toContain('123 Bluebird Rd');
    expect(variants).toContain('123 Bluebird Road');
    expect(variants).toContain('123 Blue Bird Rd');
    expect(new Set(variants).size).toBe(variants.length);
  });

  it('always includes the original as the first entry', () => {
    const variants = buildVariants('268 Mallard Rd');
    expect(variants[0]).toBe('268 Mallard Rd');
  });
});
