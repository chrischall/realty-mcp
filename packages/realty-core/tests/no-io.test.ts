import { describe, it, expect, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// realty-core is documented as pure / no-I/O (CLAUDE.md "Hoisting policy").
// Importing it must not pull in a filesystem builtin — that forces
// `nodejs_compat` on Workers-hosted consumers — and must not write to the
// console (fleet-audit#664).

describe('realty-core module load', () => {
  it('loads the built ESM dist in plain node without resolving fs and with no output', () => {
    const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
    const distIndex = join(pkgDir, 'dist', 'index.js');
    if (!existsSync(distIndex)) {
      execFileSync('npm', ['run', 'build'], { cwd: pkgDir, stdio: 'pipe' });
    }
    const script = [
      `import { registerHooks } from 'node:module';`,
      `const FS = new Set(['fs', 'node:fs', 'fs/promises', 'node:fs/promises']);`,
      `registerHooks({ resolve(spec, ctx, next) {`,
      `  if (FS.has(spec)) throw new Error('realty-core resolved ' + spec + ' from ' + ctx.parentURL);`,
      `  return next(spec, ctx);`,
      `} });`,
      `const core = await import(${JSON.stringify(pathToFileURL(distIndex).href)});`,
      `if (typeof core.LocalityAliasMap !== 'function') throw new Error('bad export');`,
    ].join('\n');
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(out).toBe('');
  });

  it('never calls console from the shipped helpers', async () => {
    const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;
    const spies = methods.map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {})
    );
    const core = await import('../src/index.js');
    // The one helper that used to log: an unrecognised HOA frequency.
    expect(core.hoaToMonthlyUsd(250, 'per fortnight')).toBeNull();
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });
});
