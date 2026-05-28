import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalityAliasMap } from '../src/locality-alias.js';

describe('LocalityAliasMap (default set)', () => {
  it('returns Rutherfordton as an alias for Lake Lure, NC', () => {
    const map = LocalityAliasMap.withDefaults();
    const r = map.lookup({ city: 'Lake Lure', state: 'NC' });
    expect(r.aliases).toContain('Rutherfordton');
  });

  it('returns Banner Elk as an alias for Beech Mountain, NC', () => {
    const map = LocalityAliasMap.withDefaults();
    const r = map.lookup({ city: 'Beech Mountain', state: 'NC' });
    expect(r.aliases).toContain('Banner Elk');
  });

  it('returns Banner Elk as an alias for Sugar Mountain, NC', () => {
    const map = LocalityAliasMap.withDefaults();
    const r = map.lookup({ city: 'Sugar Mountain', state: 'NC' });
    expect(r.aliases).toContain('Banner Elk');
  });

  it('is case-insensitive on the city lookup', () => {
    const map = LocalityAliasMap.withDefaults();
    const r = map.lookup({ city: 'lake lure', state: 'nc' });
    expect(r.aliases).toContain('Rutherfordton');
  });

  it('returns empty aliases and null resolved for unknown localities', () => {
    const map = LocalityAliasMap.withDefaults();
    const r = map.lookup({ city: 'Townsville', state: 'XX' });
    expect(r.aliases).toEqual([]);
    expect(r.resolved).toBeNull();
  });
});

describe('LocalityAliasMap.fromFile', () => {
  it('loads aliases from a JSON file', () => {
    const path = join(tmpdir(), `locality-${Date.now()}.json`);
    writeFileSync(
      path,
      JSON.stringify({
        entries: [
          {
            city: 'Test City',
            state: 'CA',
            aliases: ['Other Name'],
            resolved: 'Other Name',
          },
        ],
      })
    );
    const map = LocalityAliasMap.fromFile(path);
    expect(map.lookup({ city: 'Test City', state: 'CA' })).toEqual({
      aliases: ['Other Name'],
      resolved: 'Other Name',
    });
  });
});
