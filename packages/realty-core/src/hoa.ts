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
 * or an unparseable frequency string all yield `null` (the last with a
 * stderr warning so unknown vocabulary doesn't go unnoticed). The result
 * is rounded to the nearest dollar.
 */

/**
 * Normalize an HOA fee to monthly USD, rounded to the nearest dollar.
 *
 * `frequency` accepts both the MLS enum vocabulary
 * (`Monthly` / `Annually` / `Quarterly` / `SemiAnnually` / `Weekly`) and
 * loose DOM-scraped forms (`"$250 / month"`, `"per year"`,
 * `"bi-annual"`, …) — matching is case- and whitespace-insensitive.
 *
 * Returns `null` for a missing / zero / non-finite `amount`, a missing
 * `frequency`, or an unrecognized frequency string (the last logs a
 * stderr warning).
 *
 * @example hoaToMonthlyUsd(1200, 'Annually')      // 100
 * @example hoaToMonthlyUsd(250, '$250 / month')   // 250
 * @example hoaToMonthlyUsd(100, 'Weekly')         // 433
 * @example hoaToMonthlyUsd(0, 'Monthly')          // null
 */
export function hoaToMonthlyUsd(
  amount: number | null | undefined,
  frequency: string | null | undefined
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
    console.error(
      `[realty-core] hoaToMonthlyUsd: unknown HOA frequency "${frequency}" — returning null`
    );
    return null;
  }
  return Math.round(monthly);
}
