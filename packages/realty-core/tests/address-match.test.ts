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

  it('drops unit / floor designators and their ids (fleet-audit#920)', () => {
    expect(tokenize('123 Main St Apt 5')).toEqual(['123', 'main']);
    expect(tokenize('123 Main St Unit 12, Charlotte, NC')).toEqual([
      '123',
      'main',
      'charlotte',
    ]);
    expect(tokenize('Storgatan 12, 3 tr')).toEqual(['storgatan', '12']);
    expect(tokenize('Storgatan 12 lgh 1201')).toEqual(['storgatan', '12']);
  });

  it('keeps a letter-suffixed house number as the anchor (fleet-audit#954)', () => {
    expect(tokenize('Kungsgatan 3A')).toEqual(['kungsgatan', '3a']);
    expect(tokenize('Kungsgatan 3 A, Göteborg')).toEqual(['kungsgatan', '3a', 'goteborg']);
    expect(tokenize('12B Main St')).toEqual(['12b', 'main']);
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

    describe('city names that start with a direction word', () => {
      it('does not let a no-comma city name satisfy a prefix conflict (onehome haystack)', () => {
        const haystack =
          '123 s main st north charleston sc 29405 123 S Main St, North Charleston, SC 29405';
        expect(
          addressMatch('123 N Main St, North Charleston, SC', haystack)
        ).toEqual({ matched: false, score: 0 });
      });

      it('still matches the right parcel in a no-comma haystack', () => {
        const haystack =
          '123 n main st north charleston sc 29405 123 N Main St, North Charleston, SC 29405';
        expect(
          addressMatch('123 N Main St, North Charleston, SC', haystack).matched
        ).toBe(true);
      });

      it('does not read a no-comma city as a suffix directional (redfin row.name first)', () => {
        // 'West' begins the locality, not a suffix — no conflict with E.
        expect(
          addressMatch('123 Main St E', '123 Main St West Palm Beach FL')
        ).toEqual({ matched: true, score: 1 });
        expect(
          addressMatch('123 Main St E', '123 Main St West Palm Beach FL 33401')
            .matched
        ).toBe(true);
      });

      it('handles other direction-word cities in no-comma queries', () => {
        expect(
          addressMatch('500 Oak Ave South Bend IN', '500 Oak Ave N').matched
        ).toBe(true);
        expect(
          addressMatch('500 Oak Ave East Lansing MI', '500 Oak Ave W, East Lansing, MI')
            .matched
        ).toBe(true);
      });
    });

    it('compares prefix with prefix and suffix with suffix', () => {
      // Prefix N vs suffix N on the other side is not overlap evidence
      // that rescues a conflicting prefix.
      expect(
        addressMatch('123 N Main St', '123 S Main St N').matched
      ).toBe(false);
      expect(
        addressMatch('123 N Main St NW', '123 N Main St SE').matched
      ).toBe(false);
    });

    it('reads a quadrant suffix (NE/NW/SE/SW) before comma-less city text (onehome haystack)', () => {
      // DC-style quadrants never begin a city name, so they count as a
      // suffix even when locality text follows without a comma.
      expect(
        addressMatch(
          '123 Main St NW',
          '123 main st se washington dc 20001 123 Main St SE, Washington, DC 20001'
        )
      ).toEqual({ matched: false, score: 0 });
      expect(
        addressMatch(
          '123 Main St NW',
          '123 main st nw washington dc 20001 123 Main St NW, Washington, DC 20001'
        ).matched
      ).toBe(true);
      expect(
        addressMatch('123 Main St NW, Washington, DC', '123 Main St SE Washington DC')
          .matched
      ).toBe(false);
    });

    it('reads a suffix directional followed by a unit designator', () => {
      expect(
        addressMatch('123 Main St NW Apt 4', '123 Main St SE Apt 4').matched
      ).toBe(false);
      expect(
        addressMatch('123 Main St NW Apt 4', '123 Main St NW Apt 4').matched
      ).toBe(true);
    });
  });

  describe('extra street-name words (fleet-audit#215)', () => {
    it('treats a US route prefix as optional ("US Hwy 50" vs "Hwy 50")', () => {
      expect(addressMatch('123 US Hwy 50', '123 Hwy 50').matched).toBe(true);
      expect(addressMatch('123 Hwy 50', '123 US Hwy 50').matched).toBe(true);
    });

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

    it('normalises St ↔ Saint as a name word', () => {
      expect(
        addressMatch('123 St Charles Ave', '123 Saint Charles Ave').matched
      ).toBe(true);
      expect(
        addressMatch('123 Saint Charles Ave', '123 St Charles Ave, New Orleans, LA')
          .matched
      ).toBe(true);
    });

    it('treats generational suffixes (Jr, Sr) as optional name words', () => {
      expect(
        addressMatch('123 Martin Luther King Jr Blvd', '123 Martin Luther King Blvd')
          .matched
      ).toBe(true);
      expect(
        addressMatch(
          '123 Martin Luther King Blvd',
          '123 Martin Luther King Jr Blvd, Charlotte, NC'
        ).matched
      ).toBe(true);
      expect(
        addressMatch('45 Hank Williams Sr Way', '45 Hank Williams Way').matched
      ).toBe(true);
    });

    it('still rejects a different street that differs by more than Jr/Sr', () => {
      expect(
        addressMatch('123 Martin Luther King Jr Blvd', '123 King Blvd').matched
      ).toBe(false);
    });
  });

  describe('unit and floor designators (fleet-audit#920)', () => {
    it('matches a query carrying a unit against a street-only candidate', () => {
      // Portals return the street line only (zillow listingStreetAddress,
      // redfin streetLineOf, homes street_address), so a condo query
      // must not hard-reject on its own unit number.
      expect(addressMatch('123 Main St Apt 5', '123 Main St, Charlotte, NC')).toEqual(
        { matched: true, score: 1 }
      );
      expect(addressMatch('123 Main St Unit 12', '123 Main St').matched).toBe(true);
      expect(addressMatch('123 Main St #5', '123 Main St').matched).toBe(true);
      expect(addressMatch('123 Main St Apt 101', '123 Main St').matched).toBe(true);
      expect(addressMatch('123 Main St Ste 200', '123 Main St').matched).toBe(true);
    });

    it('matches Swedish floor / apartment designators against a street-only candidate', () => {
      expect(addressMatch('Storgatan 12, 3 tr', 'Storgatan 12, Stockholm').matched).toBe(
        true
      );
      expect(addressMatch('Storgatan 12, 3 tr', 'Storgatan 12').matched).toBe(true);
      expect(addressMatch('Storgatan 12 lgh 1201', 'Storgatan 12').matched).toBe(true);
      expect(addressMatch('Storgatan 12, lgh 1201', 'Storgatan 12, 3 tr').matched).toBe(
        true
      );
    });

    it('still matches when only the candidate carries the unit', () => {
      expect(addressMatch('123 Main St', '123 Main St Apt 5').score).toBe(1);
    });

    it('still anchors on the house number when a unit is present', () => {
      expect(addressMatch('124 Main St Apt 5', '123 Main St')).toEqual({
        matched: false,
        score: 0,
      });
      expect(addressMatch('Storgatan 14, 3 tr', 'Storgatan 12').matched).toBe(false);
    });

    it('rejects conflicting units when both sides carry one', () => {
      expect(addressMatch('123 Main St Apt 5', '123 Main St Apt 6')).toEqual({
        matched: false,
        score: 0,
      });
      expect(addressMatch('123 Main St Apt 101', '123 Main St Apt 102').matched).toBe(
        false
      );
      expect(addressMatch('123 Main St Apt 5', '123 Main St Unit 5').matched).toBe(true);
      expect(addressMatch('Storgatan 12 lgh 1201', 'Storgatan 12 lgh 1202').matched).toBe(
        false
      );
    });

    it('does not read a name word that happens to be a designator as a unit', () => {
      expect(addressMatch('123 Space Needle Way', '123 Space Needle Way').score).toBe(1);
      expect(addressMatch('123 Lot Tree Ln', '123 Lot Tree Lane').matched).toBe(true);
    });
  });

  describe('letter-suffixed house numbers (fleet-audit#954)', () => {
    it('anchors on a number-last letter-suffixed house number', () => {
      expect(addressMatch('Kungsgatan 3A', 'Kungsgatan 3, Göteborg')).toEqual({
        matched: false,
        score: 0,
      });
      expect(addressMatch('Kungsgatan 3A', 'Kungsgatan 3B, Göteborg').matched).toBe(false);
      expect(addressMatch('Kungsgatan 3A', 'Kungsgatan 99, Göteborg').matched).toBe(false);
      expect(addressMatch('Kungsgatan 3', 'Kungsgatan 3B, Göteborg').matched).toBe(false);
      expect(addressMatch('Kungsgatan 3A', 'Kungsgatan 3A, Göteborg')).toEqual({
        matched: true,
        score: 1,
      });
    });

    it('normalises a spaced letter suffix ("3 A" ≡ "3A")', () => {
      expect(addressMatch('Kungsgatan 3 A', 'Kungsgatan 3A, Göteborg').matched).toBe(true);
      expect(addressMatch('Kungsgatan 3A', 'Kungsgatan 3 A').matched).toBe(true);
      expect(addressMatch('Kungsgatan 3 A', 'Kungsgatan 3 B').matched).toBe(false);
    });

    it('anchors on a number-first letter-suffixed house number', () => {
      expect(addressMatch('12B Main St', '12 Main St').matched).toBe(false);
      expect(addressMatch('12 Main St', '12B Main St').matched).toBe(false);
      expect(addressMatch('12B Main St', '12B Main Street, Charlotte, NC').score).toBe(1);
    });
  });

  describe('state codes and ZIPs are not floors', () => {
    it('keeps "FL <zip>" as locality, not a floor designator', () => {
      expect(tokenize('123 Main St, Tampa, FL 33602')).toEqual([
        '123', 'main', 'tampa', '33602',
      ]);
    });

    it('rejects the same house number in a different Florida city', () => {
      expect(
        addressMatch('123 Main St, Tampa, FL 33602', '123 Main St, Orlando, FL 32801').matched
      ).toBe(false);
    });

    it('still strips a real floor ("Fl 3", "Floor 12")', () => {
      expect(addressMatch('123 Main St Fl 3', '123 Main Street').matched).toBe(true);
      expect(addressMatch('123 Main St, Floor 12', '123 Main Street').matched).toBe(true);
    });
  });

  describe('route-numbered streets', () => {
    it('rejects a different road or route number', () => {
      expect(
        addressMatch('4501 County Road 12, Anytown, TX', '4501 County Road 21, Anytown, TX').matched
      ).toBe(false);
      expect(addressMatch('123 Highway 50', '123 Highway 51').matched).toBe(false);
      expect(addressMatch('123 State Route 7', '123 State Route 9').matched).toBe(false);
      expect(addressMatch('123 US Hwy 50', '123 US Hwy 51').matched).toBe(false);
      expect(addressMatch('123 Route 101', '123 Route 102').matched).toBe(false);
    });

    it('rejects a candidate that drops the route number', () => {
      expect(addressMatch('123 County Road 12', '123 County Road').matched).toBe(false);
      expect(addressMatch('123 County Road', '123 County Road 12').matched).toBe(false);
    });

    it('still matches the same route written differently', () => {
      expect(addressMatch('123 US Hwy 50', '123 Hwy 50').matched).toBe(true);
      expect(addressMatch('4501 County Road 12, Anytown, TX', '4501 County Road 12').matched).toBe(
        true
      );
      expect(addressMatch('123 Route 101 Apt 5', '123 Route 101').matched).toBe(true);
    });

    it('does not read a comma-less ZIP after a street type as a route number', () => {
      expect(addressMatch('123 Old Mill Rd 28202', '123 Old Mill Rd').matched).toBe(true);
    });
  });

  describe('Swedish "N tr" floors never take the house number', () => {
    it('keeps the only number as the anchor', () => {
      expect(addressMatch('Storgatan 3 tr', 'Storgatan 99').matched).toBe(false);
      expect(addressMatch('Storgatan 12 3 tr', 'Storgatan 12').matched).toBe(true);
    });
  });

  describe('bare "#" units', () => {
    it('matches a street-only candidate', () => {
      expect(addressMatch('123 Main St #101', '123 Main Street').matched).toBe(true);
    });

    it('rejects a different "#" unit, like "Apt"', () => {
      expect(addressMatch('123 Main St #101', '123 Main St #102').matched).toBe(false);
      expect(addressMatch('123 Main St #101', '123 Main St Apt 102').matched).toBe(false);
      expect(addressMatch('123 Main St #101', '123 Main St Unit 101').matched).toBe(true);
    });

    it('treats "Apt #5" as one unit', () => {
      expect(tokenize('123 Main St Apt #5')).toEqual(['123', 'main']);
      expect(addressMatch('123 Main St Apt #5', '123 Main St #5').matched).toBe(true);
      expect(addressMatch('123 Main St Apt #5', '123 Main St #6').matched).toBe(false);
    });
  });

  it('handles empty input as no match', () => {
    const r = addressMatch('', '126 Sleeping Bear Lane');
    expect(r.matched).toBe(false);
    expect(r.score).toBe(0);
  });
});
