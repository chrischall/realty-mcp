/**
 * HOA-fee normalization — any billing frequency to monthly USD.
 *
 * Every cohort MCP that surfaces an HOA fee normalizes it to a monthly
 * USD figure with the same per-frequency divisor table:
 *
 *  - redfin-mcp `src/derived.ts` `hoaToMonthlyUsd()` — switch over the
 *    RESO/MLS enum (`Annually | Quarterly | Monthly | SemiAnnually |
 *    Weekly`)
 *  - zillow-mcp / compass-mcp / onehome-mcp — same switch, inline in
 *    their property formatters
 *  - homes-mcp `src/format.ts` `hoaToMonthlyUsd()` — the most defensive
 *    variant: regex-tolerant so it also handles DOM-scraped strings like
 *    `"$250 / month"`, `"per month"`, `"Semi-Annually"`
 *
 * This is the canonical home so the cohort migration (realty-mcp#1)
 * collapses those copies into one. Pure / dependency-free.
 *
 * The canonical form is the UNION of both input vocabularies: it accepts
 * the clean MLS enum labels AND the looser DOM-string forms (homes-mcp's
 * regex-tolerant matcher strictly dominates the bare `switch`, so adopting
 * it loses nothing). Matching is case- and whitespace-insensitive and
 * tolerates a leading `/` or `per ` ("/ month", "per month").
 *
 * Frequency → monthly divisor:
 *   - Monthly      → amount
 *   - Annually     → amount / 12
 *   - Quarterly    → amount / 3
 *   - SemiAnnually → amount / 6
 *   - Weekly       → amount * 52 / 12
 *
 * Null-safe: a missing / zero / non-finite amount, a missing frequency,
 * or an unparseable frequency string all yield `null`. The result is
 * rounded to the nearest dollar. The helper never writes to the console
 * (realty-core is no-I/O, fleet-audit#664); a consumer that wants unknown
 * vocabulary surfaced passes `onUnknownFrequency` and logs it itself.
 */

/** Options for {@link hoaToMonthlyUsd}. */
export interface HoaToMonthlyOptions {
  /**
   * Called with the raw `frequency` when it is present but not recognised
   * (the call still returns `null`). Use it to log or count unknown
   * vocabulary from your own logger — realty-core never writes to the
   * console.
   */
  onUnknownFrequency?: (frequency: string) => void;
}

/**
 * Normalize an HOA fee to monthly USD, rounded to the nearest dollar.
 *
 * `frequency` accepts both the MLS enum vocabulary
 * (`Monthly` / `Annually` / `Quarterly` / `SemiAnnually` / `Weekly`) and
 * loose DOM-scraped forms (`"$250 / month"`, `"per year"`,
 * `"bi-annual"`, …) — matching is case- and whitespace-insensitive.
 *
 * Returns `null` for a missing / zero / non-finite `amount`, a missing
 * `frequency`, or an unrecognized frequency string. For the last case
 * `options.onUnknownFrequency` (if given) is called with the raw string —
 * nothing is logged by default.
 *
 * @example hoaToMonthlyUsd(1200, 'Annually')      // 100
 * @example hoaToMonthlyUsd(250, '$250 / month')   // 250
 * @example hoaToMonthlyUsd(100, 'Weekly')         // 433
 * @example hoaToMonthlyUsd(0, 'Monthly')          // null
 */
export function hoaToMonthlyUsd(
  amount: number | null | undefined,
  frequency: string | null | undefined,
  options: HoaToMonthlyOptions = {}
): number | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount === 0) {
    return null;
  }
  if (!frequency) return null;

  // Lowercase + collapse whitespace so the same rule drives clean MLS
  // enum labels and DOM-scraped strings alike.
  const f = frequency.trim().toLowerCase();

  let monthly: number;
  if (/^month/.test(f) || /per ?month/.test(f) || /\/ ?month/.test(f)) {
    monthly = amount;
  } else if (
    /^annual/.test(f) ||
    /^year/.test(f) ||
    /per ?year/.test(f) ||
    /\/ ?year/.test(f)
  ) {
    monthly = amount / 12;
  } else if (
    /^quarter/.test(f) ||
    /per ?quarter/.test(f) ||
    /\/ ?quarter/.test(f)
  ) {
    monthly = amount / 3;
  } else if (/^semi.?annual/.test(f) || /bi.?annual/.test(f)) {
    monthly = amount / 6;
  } else if (/^week/.test(f) || /per ?week/.test(f) || /\/ ?week/.test(f)) {
    monthly = (amount * 52) / 12;
  } else {
    options.onUnknownFrequency?.(frequency);
    return null;
  }
  return Math.round(monthly);
}
