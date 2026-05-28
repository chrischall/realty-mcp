import { describe, it, expect } from 'vitest';
import { tokenize, addressMatch } from '../src/address-match.js';

describe('tokenize', () => {
  it('lowercases and splits on whitespace', () => {
    expect(tokenize('126 Sleeping Bear Ln')).toEqual([
      '126',
      'sleeping',
      'bear',
    ]);
  });

  it('drops tokens shorter than 3 chars', () => {
    // "Ln" (2 chars) and "St" (2 chars) — both dropped. Numeric "126"
    // is 3 chars so it stays. This is the cohort convergence — homes,
    // compass, redfin all drop sub-3-char tokens to absorb the
    // suffix-abbreviation noise without needing a full SUFFIX_PAIRS
    // table at the match layer.
    expect(tokenize('126 Sleeping Bear Ln, Brooklyn NY')).toEqual([
      '126',
      'sleeping',
      'bear',
      'brooklyn',
    ]);
  });

  it('strips punctuation', () => {
    expect(tokenize('123 Main St., #4B, Brooklyn, N.Y. 11201')).toEqual([
      '123',
      'main',
      'brooklyn',
      '11201',
    ]);
  });

  it('returns empty for empty/whitespace input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('addressMatch', () => {
  it('matches when every input token appears in the candidate', () => {
    const r = addressMatch('126 Sleeping Bear Ln', '126 Sleeping Bear Lane');
    expect(r.matched).toBe(true);
    expect(r.score).toBe(1);
  });

  it('requires the leading numeric token to match exactly (anchored)', () => {
    // homes #50: dropping the anchor lets "12" silently match "1234".
    const r = addressMatch('12 Main', '1234 Main Street');
    expect(r.matched).toBe(false);
  });

  it('matches partial overlap above the > 0.5 threshold', () => {
    // 3 of 4 input tokens (including the leading number) appear in
    // the candidate → score 0.75, > 0.5 → matched.
    const r = addressMatch(
      '126 Sleeping Bear Trail',
      '126 Sleeping Bear Lane, Brooklyn NY'
    );
    expect(r.matched).toBe(true);
    expect(r.score).toBeGreaterThan(0.5);
  });

  it('rejects exact-50% overlap (strict majority, homes #50)', () => {
    // 2 of 4 input tokens match → 0.5, NOT > 0.5 → no match.
    const r = addressMatch('126 Aaaa Bbbb Cccc', '126 Aaaa');
    expect(r.matched).toBe(false);
    expect(r.score).toBeCloseTo(0.5);
  });

  it('handles empty input as no match', () => {
    const r = addressMatch('', '126 Sleeping Bear Lane');
    expect(r.matched).toBe(false);
    expect(r.score).toBe(0);
  });
});
