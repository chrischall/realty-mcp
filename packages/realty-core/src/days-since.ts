/**
 * Day-count derivation — whole days elapsed since a timestamp.
 *
 * Several cohort MCPs derive a `days_on_market`-style field from a
 * listing timestamp with the same `floor((now - at) / 86_400_000)`
 * expression, differing only in the input type:
 *
 *  - onehome-mcp `src/format.ts` `daysSince()` — ISO string input
 *  - homes-mcp `src/format.ts` `daysSince()` — ISO string (near-identical)
 *  - zillow-mcp `src/tools/properties.ts` — inlined, ISO string
 *  - compass-mcp `src/tools/properties.ts` `daysSinceMs()` — unix-ms input
 *
 * This is the canonical home so the cohort migration (realty-mcp#1)
 * collapses those copies into one. Pure / dependency-free.
 *
 * The canonical form takes the UNION input `string | number`: an ISO
 * (or any `Date.parse`-able) string OR a unix-ms timestamp, covering
 * every cohort variant. To stay PURE and testable, the "now" reference
 * is an injectable second argument that DEFAULTS to `Date.now()` — tests
 * pass a pinned clock; production callers omit it. `Date.now()` is never
 * called unconditionally inside.
 *
 * Behavior matches the cohort: the raw `Math.floor` of the day delta is
 * returned, so a same-day timestamp yields `0` and a FUTURE timestamp
 * yields a negative count (the cohort impls do not clamp). `null` is
 * reserved for genuinely unusable input (missing / unparseable /
 * non-finite).
 */

/** Milliseconds in one day. */
const MS_PER_DAY = 86_400_000;

/**
 * Whole days elapsed between `at` and `now`, floored.
 *
 * `at` accepts the union of cohort inputs: a `Date.parse`-able string
 * (ISO or bare date) OR a unix-ms number. `now` defaults to
 * `Date.now()` and is injectable so tests can pin a fixed clock.
 *
 * Returns the raw floored delta — `0` for a sub-24h timestamp, a
 * NEGATIVE value for a future timestamp (cohort behavior; no clamp).
 * Returns `null` only for missing / unparseable / non-finite input.
 *
 * @example daysSince('2026-05-18', Date.parse('2026-05-28')) // 10
 * @example daysSince(1747526400000, 1748390400000)           // 10
 * @example daysSince(undefined)                              // null
 */
export function daysSince(
  at: string | number | null | undefined,
  now: number = Date.now()
): number | null {
  if (at === null || at === undefined) return null;

  const t = typeof at === 'number' ? at : Date.parse(at);
  if (!Number.isFinite(t)) return null;

  const delta = now - t;
  if (!Number.isFinite(delta)) return null;

  return Math.floor(delta / MS_PER_DAY);
}
