import { describe, it, expect, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

describe('LocalityAliasMap.fromJSON', () => {
  it('builds a map from already-parsed JSON (no I/O)', () => {
    const map = LocalityAliasMap.fromJSON({
      entries: [
        { city: 'Test City', state: 'CA', aliases: ['Other Name'], resolved: 'Other Name' },
        { city: 'No Parent', state: 'CA', aliases: ['Somewhere'] },
      ],
    });
    expect(map.lookup({ city: 'test city', state: 'ca' })).toEqual({
      aliases: ['Other Name'],
      resolved: 'Other Name',
    });
    expect(map.lookup({ city: 'No Parent', state: 'CA' })).toEqual({
      aliases: ['Somewhere'],
      resolved: null,
    });
  });

  it('treats a missing entries array as an empty map', () => {
    const map = LocalityAliasMap.fromJSON({});
    expect(map.lookup({ city: 'Lake Lure', state: 'NC' })).toEqual({
      aliases: [],
      resolved: null,
    });
  });

  it.each([
    ['a non-object', 'nope', /expected an object/],
    ['a non-array entries', { entries: {} }, /"entries" must be an array/],
    ['an entry missing city', { entries: [{ state: 'NC', aliases: [] }] }, /entries\[0\]\.city/],
    ['an entry missing state', { entries: [{ city: 'X', aliases: [] }] }, /entries\[0\]\.state/],
    ['non-string aliases', { entries: [{ city: 'X', state: 'NC', aliases: [1] }] }, /entries\[0\]\.aliases/],
    ['a non-string resolved', { entries: [{ city: 'X', state: 'NC', aliases: [], resolved: 3 }] }, /entries\[0\]\.resolved/],
  ])('rejects %s with a TypeError naming the bad field', (_label, input, msg) => {
    expect(() => LocalityAliasMap.fromJSON(input)).toThrow(TypeError);
    expect(() => LocalityAliasMap.fromJSON(input)).toThrow(msg);
  });
});

// zillow-mcp's documented ZILLOW_LOCALITY_ALIASES_FILE format (mint.yaml):
// a top-level array of state-less [a, b] pairs, registered both ways.
// Accepting it lets zillow drop its local loader without breaking existing
// config files (chrischall/fleet-audit#1144).
describe('LocalityAliasMap.fromJSON — legacy [a, b] pair format', () => {
  const pairs = [
    ['Lake Lure', 'Rutherfordton'],
    ['Beech Mountain', 'Banner Elk'],
    ['Sugar Mountain', 'Banner Elk'],
  ];

  it('registers each pair both ways, with no resolved parent', () => {
    const map = LocalityAliasMap.fromJSON(pairs);
    expect(map.lookup({ city: 'Lake Lure', state: 'NC' })).toEqual({ aliases: ['Rutherfordton'], resolved: null });
    expect(map.lookup({ city: 'Rutherfordton', state: 'NC' })).toEqual({ aliases: ['Lake Lure'], resolved: null });
  });

  it('collects every partner of a shared city, in file order, without duplicates', () => {
    const map = LocalityAliasMap.fromJSON([...pairs, ['Beech Mountain', 'Banner Elk']]);
    expect(map.lookup({ city: 'Banner Elk', state: 'NC' }).aliases).toEqual(['Beech Mountain', 'Sugar Mountain']);
    expect(map.lookup({ city: 'Beech Mountain', state: 'NC' }).aliases).toEqual(['Banner Elk']);
  });

  it('merges partners of the same city however the file spells it', () => {
    const map = LocalityAliasMap.fromJSON([['Banner Elk', 'Beech Mountain'], ['banner elk ', 'Sugar Mountain']]);
    expect(map.lookup({ city: 'BANNER ELK', state: 'NC' }).aliases).toEqual(['Beech Mountain', 'Sugar Mountain']);
  });

  it('matches a state-less pair whatever the state — including none', () => {
    const map = LocalityAliasMap.fromJSON(pairs);
    expect(map.lookup({ city: 'lake lure', state: 'SC' }).aliases).toEqual(['Rutherfordton']);
    expect(map.lookup({ city: ' Lake Lure ', state: '' }).aliases).toEqual(['Rutherfordton']);
  });

  it('an empty array is an empty map', () => {
    expect(LocalityAliasMap.fromJSON([]).lookup({ city: 'Lake Lure', state: 'NC' })).toEqual({
      aliases: [],
      resolved: null,
    });
  });

  it.each([
    ['a non-array pair', [{ a: 1 }], /\[0\] must be a \[string, string\] pair/],
    ['a one-element pair', [['Lake Lure']], /\[0\] must be a \[string, string\] pair/],
    ['a three-element pair', [['a', 'b', 'c']], /\[0\] must be a \[string, string\] pair/],
    ['a non-string member', [['ok', 'fine'], ['Lake Lure', 3]], /\[1\] must be a \[string, string\] pair/],
  ])('rejects %s with a TypeError naming the bad pair', (_label, input, msg) => {
    expect(() => LocalityAliasMap.fromJSON(input)).toThrow(TypeError);
    expect(() => LocalityAliasMap.fromJSON(input)).toThrow(msg);
  });

  it('loads the legacy format from a file too', () => {
    const path = join(tmpdir(), `locality-legacy-${Date.now()}.json`);
    writeFileSync(path, JSON.stringify([['Lake Lure', 'Rutherfordton']]));
    expect(LocalityAliasMap.fromFile(path).lookup({ city: 'Rutherfordton', state: 'NC' }).aliases).toEqual([
      'Lake Lure',
    ]);
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

  it('throws a pointer to fromJSON when the runtime has no Node fs builtin', () => {
    const spy = vi
      .spyOn(process, 'getBuiltinModule')
      .mockReturnValue(undefined as never);
    try {
      expect(() => LocalityAliasMap.fromFile('/nonexistent.json')).toThrow(
        /fromJSON/
      );
    } finally {
      spy.mockRestore();
    }
  });

  // Regression: fromFile used `require('node:fs')` inside this ESM package
  // ("type": "module"), which vitest's transform pipeline masks but which
  // throws `ReferenceError: require is not defined` for any plain-ESM
  // consumer of the published dist. Exercise the BUILT dist in a real
  // plain-ESM node process — exactly what a consumer gets from npm.
  it('works from the built ESM dist in a plain-ESM node process', () => {
    const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
    const distFile = join(pkgDir, 'dist', 'locality-alias.js');
    if (!existsSync(distFile)) {
      execFileSync('npm', ['run', 'build'], { cwd: pkgDir, stdio: 'pipe' });
    }
    const aliasPath = join(tmpdir(), `locality-dist-${Date.now()}.json`);
    writeFileSync(
      aliasPath,
      JSON.stringify({
        entries: [
          { city: 'Test City', state: 'CA', aliases: ['Other Name'], resolved: 'Other Name' },
        ],
      })
    );
    const script = [
      `import { LocalityAliasMap } from ${JSON.stringify(pathToFileURL(distFile).href)};`,
      `const map = LocalityAliasMap.fromFile(${JSON.stringify(aliasPath)});`,
      `const r = map.lookup({ city: 'Test City', state: 'CA' });`,
      `if (r.resolved !== 'Other Name') throw new Error('lookup failed: ' + JSON.stringify(r));`,
    ].join('\n');
    // Throws (non-zero exit) if the dist is not loadable/callable as plain ESM.
    execFileSync(process.execPath, ['--input-type=module', '-e', script], { stdio: 'pipe' });
  });
});
