/**
 * Input bounds + validation shared by the local calculators
 * (`calculateMortgage`, `calculateAffordability`, `estimateRentVsBuy`).
 *
 * Every guard rejects non-finite input first: `NaN <= 0` is `false`, so a
 * plain `x <= 0` check waves NaN through and the calculator returns NaN
 * totals (`null` once JSON-serialised) — fleet-audit#661.
 *
 * The year counts are capped because `estimateRentVsBuy` builds one row per
 * horizon year synchronously: an unbounded `horizon_years` (e.g. `1e8`)
 * blocks the event loop and exhausts the heap, taking every other tool on
 * the MCP process down with it (fleet-audit#1021, zillow-mcp#809). The caps
 * are exported so consumer tool schemas can `.max()` them and reject at the
 * schema layer with the same limit.
 */

/** Longest rent-vs-buy projection horizon accepted, in years. */
export const MAX_HORIZON_YEARS = 100;

/** Longest loan term accepted by every calculator, in years. */
export const MAX_LOAN_TERM_YEARS = 50;

/** Throw unless `value` is a finite number. */
export function requireFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new Error(`${name} must be a finite number`);
}

/** Throw unless `value` is a finite number > 0. */
export function requirePositive(name: string, value: number): void {
  requireFinite(name, value);
  if (value <= 0) throw new Error(`${name} must be positive`);
}

/** Throw unless `value` is a finite number >= 0. */
export function requireNonNegative(name: string, value: number): void {
  requireFinite(name, value);
  if (value < 0) throw new Error(`${name} must be >= 0`);
}

/** Throw unless an optional `value` is absent or finite. */
export function requireOptionalFinite(
  name: string,
  value: number | undefined
): void {
  if (value !== undefined) requireFinite(name, value);
}

/** Throw unless `value` is a whole number of years in `1..max`. */
export function requireYears(name: string, value: number, max: number): void {
  requirePositive(name, value);
  if (!Number.isInteger(value)) throw new Error(`${name} must be a whole number of years`);
  if (value > max) throw new Error(`${name} must be <= ${max}`);
}
