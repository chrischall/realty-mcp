import { describe, it, expect } from 'vitest';
import { extractFeatures } from '../src/features.js';
import type { ExtractedFeatures } from '../src/features.js';

const COMMUNITIES = [
  'Rumbling Bald',
  'Riverbend at Lake Lure',
  'The Lodges at Eagles Nest',
];

describe('extractFeatures', () => {
  it('detects lake_front from lakefront / lake front / waterfront', () => {
    expect(extractFeatures('Stunning lakefront retreat.', []).lake_front).toBe(
      true
    );
    expect(extractFeatures('On the lake front with views.', []).lake_front).toBe(
      true
    );
    expect(extractFeatures('Rare waterfront parcel.', []).lake_front).toBe(true);
    expect(
      extractFeatures('A mile from the lake, no frontage.', []).lake_front
    ).toBe(false);
  });

  it('detects hot_tub', () => {
    expect(extractFeatures('Relax in the hot tub each evening.', []).hot_tub).toBe(
      true
    );
    expect(extractFeatures('No spa here.', []).hot_tub).toBe(false);
  });

  it('detects dock specificity (private > community > boat_slip > marina)', () => {
    expect(extractFeatures('Your own private dock.', []).dock).toBe('private');
    expect(extractFeatures('Private boat dock included.', []).dock).toBe(
      'private'
    );
    expect(extractFeatures('Shared dock for residents.', []).dock).toBe(
      'community'
    );
    expect(extractFeatures('Community dock access.', []).dock).toBe('community');
    expect(extractFeatures('Deeded boat slip conveys.', []).dock).toBe(
      'boat_slip'
    );
    expect(extractFeatures('Steps from the marina.', []).dock).toBe('marina');
    expect(extractFeatures('No water access.', []).dock).toBeNull();
  });

  it('detects furnished levels', () => {
    expect(extractFeatures('Sold fully furnished.', []).furnished).toBe('fully');
    expect(extractFeatures('Offered turnkey for investors.', []).furnished).toBe(
      'fully'
    );
    expect(
      extractFeatures('Furnishings are negotiable with the sale.', []).furnished
    ).toBe('negotiable');
    expect(
      extractFeatures('Almost furnished — a few pieces excluded.', []).furnished
    ).toBe('partial');
    expect(
      extractFeatures('Furnished with exceptions noted in MLS.', []).furnished
    ).toBe('partial');
    expect(extractFeatures('Bring your own furniture.', []).furnished).toBeNull();
  });

  it('does NOT treat unrelated "with exceptions" prose as furnished', () => {
    // Title / survey / HOA disclosure context, no furnished anchor.
    expect(
      extractFeatures('Sold with exceptions per the title report.', []).furnished
    ).toBeNull();
  });

  it('detects a finished basement', () => {
    expect(extractFeatures('Includes a finished basement.', []).basement).toBe(
      'finished'
    );
    expect(extractFeatures('The basement is finished.', []).basement).toBe(
      'finished'
    );
  });

  it('checks unfinished BEFORE finished (substring trap)', () => {
    // "finished" substring-matches inside "unfinished".
    expect(extractFeatures('Large unfinished basement.', []).basement).toBe(
      'unfinished'
    );
    expect(extractFeatures('The basement is unfinished.', []).basement).toBe(
      'unfinished'
    );
  });

  it('detects partial / mentioned-only basement', () => {
    expect(
      extractFeatures('Partially finished basement.', []).basement
    ).toBe('partial');
    expect(extractFeatures('Walk-out basement below.', []).basement).toBe(
      'unknown'
    );
    expect(extractFeatures('Slab foundation, no lower level.', []).basement).toBeNull();
  });

  it('does NOT false-positive "basement with finished oak shelving" as finished', () => {
    // The canonical guard: "with" is not a basement-state connector, so
    // the shelving adjective must not flip the basement to finished.
    expect(
      extractFeatures('Basement with finished oak shelving.', []).basement
    ).not.toBe('finished');
  });

  it('matches a community from the passed-in vocabulary', () => {
    expect(
      extractFeatures('Located in Rumbling Bald on the lake.', COMMUNITIES)
        .community
    ).toBe('Rumbling Bald');
  });

  it('returns the earliest community by document position', () => {
    // Mentions both; earliest in prose wins regardless of list order.
    const text =
      'The Lodges at Eagles Nest neighbors Rumbling Bald to the south.';
    expect(extractFeatures(text, COMMUNITIES).community).toBe(
      'The Lodges at Eagles Nest'
    );
  });

  it('returns null community when none match or vocabulary is empty', () => {
    expect(
      extractFeatures('In Rumbling Bald.', []).community
    ).toBeNull();
    expect(
      extractFeatures('Somewhere off-grid entirely.', COMMUNITIES).community
    ).toBeNull();
  });

  it('returns all-false / empty for an empty or undefined description', () => {
    const empty: ExtractedFeatures = {
      lake_front: false,
      hot_tub: false,
      basement: null,
      furnished: null,
      dock: null,
      community: null,
    };
    expect(extractFeatures('', COMMUNITIES)).toEqual(empty);
    expect(extractFeatures(undefined, COMMUNITIES)).toEqual(empty);
  });
});
