import { describe, it, expect } from 'vitest';
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
