/**
 * Tax-amount sentinel cleanup — null out the "not-yet-assessed"
 * placeholder that portals surface on new-construction listings.
 *
 * Every cohort MCP nulls out a placeholder `tax_annual` value, but
 * under three different names and two different thresholds:
 *
 *  - redfin-mcp `src/derived.ts` `cleanTaxAnnual()` → `{ tax_annual,
 *    tax_status }`, guards `=== 0 || === 1`
 *  - compass-mcp `src/tools/properties.ts` `sanitizeTaxAnnual()` →
 *    `number | null`, guards `<= 1`
 *  - homes-mcp `src/format.ts` `isTaxSentinel()` → boolean, guards
 *    `< 10` (WIDER — calibrated on real new-build listings that came
 *    back with `tax_annual` values of 0–9, homes-mcp#17)
 *  - zillow-mcp + onehome-mcp — inline, guard `<= 1`
 *
 * This is the canonical home so the cohort migration (realty-mcp#1)
 * collapses those five copies into one. Pure / dependency-free.
 *
 * The canonical threshold is homes-mcp's `< 10` — it's the only one
 * tuned against real-world data (the 0–9 new-build placeholders), so
 * it strictly dominates the `<= 1` cohort guard. The return shape is
 * redfin's richer `{ tax_annual, tax_status }` rather than a bare
 * `number | null`, so callers get the assessment-status signal for
 * free.
 *
 * `tax_status: 'not_yet_assessed'` is emitted ONLY for the sub-$10
 * placeholder. A missing / non-finite input is treated as ABSENT
 * (`{ tax_annual: null, tax_status: null }`), NOT a sentinel — the
 * listing simply didn't carry a tax figure, which is a distinct case
 * from "the portal returned a known not-yet-assessed placeholder".
 */

/**
 * Tax amounts strictly below this dollar value are treated as the
 * not-yet-assessed placeholder rather than a real assessed figure.
 * Calibrated by homes-mcp against real new-build listings returning
 * 0–9 (homes-mcp#17); strictly wider than the `<= 1` cohort guard.
 */
export const TAX_SENTINEL_THRESHOLD = 10;

/**
 * Normalize a raw annual-tax figure, nulling out the not-yet-assessed
 * placeholder that portals surface on new-construction listings.
 *
 * - A value `< 10` (including `0`) → `{ tax_annual: null, tax_status:
 *   'not_yet_assessed' }` (a known placeholder).
 * - A real value `>= 10` → `{ tax_annual: raw, tax_status: null }`.
 * - `null` / `undefined` / non-finite → `{ tax_annual: null,
 *   tax_status: null }` (absent — the listing carried no tax figure,
 *   which is distinct from a not-yet-assessed placeholder).
 *
 * @example cleanTaxAnnual(0)     // { tax_annual: null, tax_status: 'not_yet_assessed' }
 * @example cleanTaxAnnual(5)     // { tax_annual: null, tax_status: 'not_yet_assessed' }
 * @example cleanTaxAnnual(8421)  // { tax_annual: 8421, tax_status: null }
 * @example cleanTaxAnnual(null)  // { tax_annual: null, tax_status: null }
 */
export function cleanTaxAnnual(raw: number | null | undefined): {
  tax_annual: number | null;
  tax_status: 'not_yet_assessed' | null;
} {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return { tax_annual: null, tax_status: null };
  }
  if (raw < TAX_SENTINEL_THRESHOLD) {
    return { tax_annual: null, tax_status: 'not_yet_assessed' };
  }
  return { tax_annual: raw, tax_status: null };
}
