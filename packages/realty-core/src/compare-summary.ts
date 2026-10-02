/**
 * The `*_compare_properties` pivot table (fleet-audit#1091): one summary
 * row per field, `values[i]` aligned with the compared rows.
 *
 * All five cohort MCPs carry a `buildSummary` (zillow / redfin / homes /
 * compass / onehome `src/tools/compare.ts`) with three different
 * value-typing rules:
 *
 *  - homes: the property value verbatim, `undefined` → `null`.
 *  - zillow / redfin / compass: the same, behind a cast to
 *    `number | string | null`.
 *  - onehome: strings / numbers / objects pass, but every OTHER type
 *    (booleans included) collapses to `null`.
 *
 * Each copy's own comment states the intent — "summary fields match the
 * per-row property shape exactly — same primitive type, same null
 * semantics" (#18 / #37) — so the canonical rule is verbatim:
 * whatever the row's property holds, with `undefined` (and a row that
 * failed, so has no property) → `null`. onehome's boolean→null was a
 * deviation from its own stated contract.
 *
 * What stays per-repo is the field list — pass keys, or `{ field, pick }`
 * where the label differs from the property key (zillow's
 * `living_area_sqft` reads `living_area`).
 */

/** A summary field: a property key, or a label + accessor. */
export type SummaryField<P> =
  | (keyof P & string)
  | { field: string; pick: (property: P) => unknown };

/** One pivoted row. */
export interface SummaryRow<V = unknown> {
  field: string;
  values: V[];
}

/** Pivot `rows[].property` into one {@link SummaryRow} per field. */
export function pivotSummary<P>(
  rows: ReadonlyArray<{ property?: P | null }>,
  fields: ReadonlyArray<SummaryField<P>>
): SummaryRow[] {
  return fields.map((f) => {
    const field = typeof f === 'string' ? f : f.field;
    const pick =
      typeof f === 'string'
        ? (p: P) => (p as Record<string, unknown>)[f]
        : f.pick;
    return {
      field,
      values: rows.map((r) => (r.property ? (pick(r.property) ?? null) : null)),
    };
  });
}
