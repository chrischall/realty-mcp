/**
 * Price-drop derivation — absolute + percent gap between a previous and
 * current list price.
 *
 * All five cohort MCPs derive a price-drop from `previous - current`
 * with the same one-decimal percent trick (`round(x * 1000) / 10`):
 *
 *  - redfin-mcp `src/derived.ts` `priceDrop()` → `{ price_drop_amount,
 *    price_drop_percent }`
 *  - homes-mcp `src/format.ts` `computePriceDrop()` → `{ amount, percent }`
 *  - zillow-mcp / compass-mcp / onehome-mcp — inlined in their property
 *    formatters
 *
 * This is the canonical home so the cohort migration (realty-mcp#1)
 * collapses those copies into one. Pure / dependency-free.
 *
 * The canonical key names are the shorter `{ amount, percent }`
 * (homes-mcp's shape). Unlike the cohort variants that always return an
 * object (with nulls inside), the canonical helper returns a single
 * `null` when there is NO REAL DROP — current >= previous, either input
 * missing / non-finite, or `previous <= 0` (no valid division base).
 * That keeps the "is there a drop to show?" check a single truthiness
 * test for callers.
 */

/** A real price drop: dollars off, and the percent of the previous price. */
export interface PriceDrop {
  /** Absolute dollars off: `previous - current` (always positive here). */
  amount: number;
  /** Percent of the previous price, rounded to one decimal. */
  percent: number;
}

/**
 * Compute the price drop from a `previous` to a `current` list price.
 *
 * `percent` is rounded to one decimal via the cohort's
 * `round(x * 1000) / 10` trick.
 *
 * Returns `null` when there is no real drop: `current >= previous`,
 * either input missing / non-finite, or `previous <= 0`.
 *
 * @example priceDrop(500_000, 450_000) // { amount: 50000, percent: 10 }
 * @example priceDrop(525_000, 495_000) // { amount: 30000, percent: 5.7 }
 * @example priceDrop(450_000, 500_000) // null  (a raise, not a drop)
 * @example priceDrop(undefined, 450_000) // null
 */
export function priceDrop(
  previous: number | null | undefined,
  current: number | null | undefined
): PriceDrop | null {
  if (
    typeof previous !== 'number' ||
    typeof current !== 'number' ||
    !Number.isFinite(previous) ||
    !Number.isFinite(current) ||
    previous <= 0
  ) {
    return null;
  }
  const amount = previous - current;
  // No real drop: current is at or above the previous price.
  if (amount <= 0) return null;
  const percent = Math.round((amount / previous) * 1000) / 10;
  return { amount, percent };
}
