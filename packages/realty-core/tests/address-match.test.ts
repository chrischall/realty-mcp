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

  it('keeps short all-digit tokens in any position (number-last formats, fleet-audit#214)', () => {
    expect(tokenize('Storgatan 12, Stockholm')).toEqual([
      'storgatan',
      '12',
      'stockholm',
    ]);
    expect(tokenize('Gäddstigen 1')).toEqual(['gaddstigen', '1']);
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

  describe('number-last addresses (hemnet, fleet-audit#214)', () => {
    it('rejects a different house number on the same street', () => {
      expect(
        addressMatch('Storgatan 12, Stockholm', 'Storgatan 14, Stockholm')
      ).toEqual({ matched: false, score: 0 });
      expect(addressMatch('Gäddstigen 1', 'Gäddstigen 3')).toEqual({
        matched: false,
        score: 0,
      });
    });

    it('rejects a prefix-colliding house number', () => {
      expect(addressMatch('Storgatan 12', 'Storgatan 125').matched).toBe(
        false
      );
    });

    it('still matches the same number-last address', () => {
      const r = addressMatch('Storgatan 12, Stockholm', 'Storgatan 12');
      expect(r.matched).toBe(true);
      expect(addressMatch('Gäddstigen 1', 'Gäddstigen 1').score).toBe(1);
    });
  });

  describe('directionals (fleet-audit#215)', () => {
    it('rejects a conflicting prefix directional', () => {
      expect(addressMatch('123 N Main St', '123 S Main St')).toEqual({
        matched: false,
        score: 0,
      });
    });

    it('rejects a conflicting suffix directional', () => {
      expect(addressMatch('123 Main St NW', '123 Main St SE').matched).toBe(
        false
      );
    });

    it('treats spelled-out and abbreviated directionals as equal', () => {
      expect(addressMatch('123 North Main St', '123 S Main St').matched).toBe(
        false
      );
      expect(
        addressMatch('123 N Main St', '123 North Main Street').matched
      ).toBe(true);
    });

    it('accepts a candidate that omits the directional', () => {
      expect(addressMatch('123 N Main St', '123 Main St').matched).toBe(true);
    });

    it('reads a directional-looking word before the street type as the name', () => {
      expect(addressMatch('123 North St', '123 North Street').matched).toBe(
        true
      );
    });

    it('does not read a trailing state code as a directional', () => {
      expect(
        addressMatch('123 Main St', '123 Main St Omaha NE 68102').matched
      ).toBe(true);
    });
  });

  describe('extra street-name words (fleet-audit#215)', () => {
    it('rejects a candidate whose street name has an extra word', () => {
      expect(addressMatch('123 Oak St', '123 Oak Hill Dr')).toEqual({
        matched: false,
        score: 0,
      });
    });

    it('rejects symmetrically (candidate-first callers, e.g. redfin autocomplete)', () => {
      expect(addressMatch('123 Oak Hill Dr', '123 Oak St').matched).toBe(false);
      expect(addressMatch('158 Raven Hill Blvd', '158 Raven Blvd').matched).toBe(
        false
      );
    });

    it('ignores locality noise after the street type', () => {
      expect(
        addressMatch('158 Raven Blvd', '158 Raven Blvd Lake Lure NC 28746')
          .matched
      ).toBe(true);
      expect(
        addressMatch('123 Oak St', '123 Oak St, Charlotte, NC').matched
      ).toBe(true);
    });

    it('normalises name abbreviations (Mt ↔ Mount)', () => {
      expect(
        addressMatch('126 Mt Mitchell Rd', '126 Mount Mitchell Road').matched
      ).toBe(true);
    });
  });

  it('handles empty input as no match', () => {
    const r = addressMatch('', '126 Sleeping Bear Lane');
    expect(r.matched).toBe(false);
    expect(r.score).toBe(0);
  });
});
