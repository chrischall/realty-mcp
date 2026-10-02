/**
 * Default community vocabulary for `extractFeatures` (fleet-audit#1175).
 *
 * The same ten Lake Lure / mountain-NC community names were declared as
 * `DEFAULT_COMMUNITIES` in every cohort MCP's `src/features.ts`
 * (zillow / redfin / homes / compass / onehome) — the market the cohort
 * was bootstrapped against. Users in other markets override it through
 * each repo's `<PORTAL>_COMMUNITIES_FILE` env var; that loader does
 * filesystem I/O and stays per-repo (mcp-utils'
 * `createCachedJsonArrayLoader`). Only the shared list lives here.
 *
 * Frozen so a consumer can't mutate the default for everyone; the
 * loader's `defaults` takes a `string[]`, so pass a copy:
 * `createCachedJsonArrayLoader({ …, defaults: [...DEFAULT_COMMUNITIES] })`.
 */
export const DEFAULT_COMMUNITIES: readonly string[] = Object.freeze([
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
