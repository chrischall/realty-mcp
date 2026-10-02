/**
 * Sold-price market statistics (fleet-audit#1020 / #988).
 *
 * hemnet-mcp and booli-mcp each carry a `src/stats.ts`
 * (`computeMarketStats`) with the same median / mean / min / max over
 * their normalised sold rows; only the field names differ (hemnet
 * `final_price` / `price_change_percent`, booli `sold_price` /
 * `sold_vs_asking_percent`) and so do the output keys
 * (`median_final_price` vs `median_sold_price`). Here the input fields
 * and the output price name are parameters, so each repo's output is
 * reproduced key-for-key (order included).
 *
 * Stricter than both copies, deliberately:
 *  - a column keeps FINITE numbers only. Both copies kept any
 *    `typeof v === 'number'`, so one `NaN` (a failed parse upstream)
 *    turned the median, mean, min and max of the whole sample into
 *    `NaN` — which `JSON.stringify` then emits as `null`, silently
 *    reading as "no data".
 *  - min / max use a loop, not `Math.min(...xs)`, which throws
 *    `RangeError` past the engine's argument limit on a large sample.
 *
 * Rounding is unchanged: prices and per-m² values to whole units, the
 * price-change percent to one decimal.
 */

/** Median of `nums` (input not mutated); `null` when empty. */
export function median(nums: readonly number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Arithmetic mean of `nums`; `null` when empty. */
export function mean(nums: readonly number[]): number | null {
  if (nums.length === 0) return null;
  let sum = 0;
  for (const n of nums) sum += n;
  return sum / nums.length;
}

/** The finite numeric values of one field across `rows` (nulls etc. skipped). */
export function numericColumn<Row>(rows: readonly Row[], key: keyof Row): number[] {
  const out: number[] = [];
  for (const r of rows) {
    const v = r[key] as unknown;
    if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
  }
  return out;
}

/** Which row fields feed the stats, and how the price keys are named. */
export interface MarketStatsFields<Row, N extends string> {
  /** The sale-price field (hemnet `final_price`, booli `sold_price`). */
  price: keyof Row;
  /** The price-per-m² (or per-unit-area) field. */
  pricePerSqm: keyof Row;
  /** The over/under-asking percent field. */
  priceChangePercent: keyof Row;
  /** Output name for the price stats: `median_<N>`, `average_<N>`, `min_<N>`, `max_<N>`. */
  priceName: N;
}

export type MarketStats<N extends string = 'price'> = {
  sample_size: number;
  median_price_per_sqm: number | null;
  average_price_per_sqm: number | null;
  average_price_change_percent: number | null;
} & {
  [K in `median_${N}` | `average_${N}` | `min_${N}` | `max_${N}`]: number | null;
};

const roundOrNull = (n: number | null): number | null => (n === null ? null : Math.round(n));

function extreme(nums: readonly number[], pick: (a: number, b: number) => number): number | null {
  if (nums.length === 0) return null;
  let acc = nums[0]!;
  for (let i = 1; i < nums.length; i++) acc = pick(acc, nums[i]!);
  return acc;
}

/**
 * Aggregate sold rows into market statistics. `sample_size` is the row
 * count (including rows whose fields were null) — check it before
 * trusting a thin median.
 */
export function computeMarketStats<Row, N extends string>(
  rows: readonly Row[],
  fields: MarketStatsFields<Row, N>
): MarketStats<N> {
  const prices = numericColumn(rows, fields.price);
  const perSqm = numericColumn(rows, fields.pricePerSqm);
  const changes = numericColumn(rows, fields.priceChangePercent);
  const meanChange = mean(changes);
  const n = fields.priceName;
  // Built key-by-key so the output order matches both source copies.
  return {
    sample_size: rows.length,
    [`median_${n}`]: roundOrNull(median(prices)),
    [`average_${n}`]: roundOrNull(mean(prices)),
    median_price_per_sqm: roundOrNull(median(perSqm)),
    average_price_per_sqm: roundOrNull(mean(perSqm)),
    average_price_change_percent: meanChange === null ? null : Math.round(meanChange * 10) / 10,
    [`min_${n}`]: extreme(prices, Math.min),
    [`max_${n}`]: extreme(prices, Math.max),
  } as MarketStats<N>;
}
