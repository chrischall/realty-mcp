/**
 * Lot-size unit conversion — square feet to acres.
 *
 * Every cohort MCP that surfaces lot size returns it in square feet,
 * but acreage is the unit that matters for rural / mountain / land
 * listings. As of round-4 each MCP derives `lot_size_acres` inline
 * with the same `round(sqft / 43560, 2)` math:
 *
 *  - redfin-mcp `src/derived.ts` `lotSizeAcres()`
 *  - zillow-mcp / compass-mcp / onehome-mcp / homes-mcp — inline in
 *    their property formatters (the round-4 #82 rollout)
 *
 * This is the canonical home so the cohort migration (realty-mcp#1)
 * collapses those five copies into one. Pure / dependency-free.
 *
 * 1 acre = 43,560 square feet (the US survey definition).
 *
 * NOTE: onehome-mcp's feed carries a RESO `LotSizeUnits` enum (the
 * lot may already be expressed in acres), so its derivation is
 * unit-aware rather than a blind sqft conversion. A consumer with a
 * units field should normalize to square feet (or pass acres
 * through) before calling this — a unit-aware wrapper can layer on
 * top when the cohort migration lands. Keeping the core helper
 * sqft-only keeps it single-purpose and dependency-free.
 */

/** Square feet in one acre (US survey acre). */
export const SQFT_PER_ACRE = 43_560;

/**
 * Convert a lot size in square feet to acres, rounded to 2 decimals.
 *
 * Null-safe by design: returns `null` for any non-positive, missing,
 * or non-finite input (condos with no lot, absent data, NaN) — never
 * `0`, so callers can distinguish "no lot" from "a zero-acre lot".
 *
 * @example sqftToAcres(45_738) // 1.05
 * @example sqftToAcres(13_503) // 0.31
 * @example sqftToAcres(null)   // null
 */
export function sqftToAcres(sqft: number | null | undefined): number | null {
  if (typeof sqft !== 'number' || !Number.isFinite(sqft) || sqft <= 0) {
    return null;
  }
  return Math.round((sqft / SQFT_PER_ACRE) * 100) / 100;
}
