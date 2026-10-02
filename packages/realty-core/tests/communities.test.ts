import { describe, it, expect } from 'vitest';
import { DEFAULT_COMMUNITIES } from '../src/communities.js';
import { extractFeatures } from '../src/features.js';

describe('DEFAULT_COMMUNITIES', () => {
  it('is the cohort Lake Lure vocabulary, in the cohort order', () => {
    expect(DEFAULT_COMMUNITIES).toEqual([
      'Rumbling Bald',
      'Riverbend at Lake Lure',
      'The Lodges at Eagles Nest',
      'Hunters Ridge',
      'Beech Mountain Club',
      'The Cliffs',
      'Pinnacle Ridge',
      'Highland Heights',
      'Shelter Rock',
      'Charter Hills',
    ]);
  });

  it('is frozen so no consumer can mutate the shared default', () => {
    expect(Object.isFrozen(DEFAULT_COMMUNITIES)).toBe(true);
  });

  it('feeds extractFeatures (spread into a mutable copy)', () => {
    expect(
      extractFeatures('Lovely cabin in Rumbling Bald with a hot tub.', [...DEFAULT_COMMUNITIES])
        .community
    ).toBe('Rumbling Bald');
  });
});
