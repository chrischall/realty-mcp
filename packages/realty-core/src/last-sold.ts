/**
 * Last-sold derivation — the most-recent `Sold` event in a
 * price-history series (#57).
 *
 * Surveyed implementations:
 *
 *  - zillow-mcp `src/tools/properties.ts` `findLastSold` — scans for the
 *    latest event whose `event` string matches `/sold/i`, picking by
 *    `date` (ISO) or epoch `time`.
 *  - redfin-mcp `src/derived.ts` `lastSold` — same scan over
 *    `eventDescription` / `eventDate`.
 *
 * The two differ only in field names (`event`/`date`/`time` vs
 * `eventDescription`/`eventDate`). Rather than hard-couple to one
 * portal's record shape, this canonical form is generic over the event
 * type `E` and takes small ACCESSORS — so each portal supplies its own
 * `{ date, price, type }` getters and the core stays shape-agnostic.
 *
 * It LEVERAGES candidate E: a "Sold" event is identified by
 * `mapEventType(get.type(e)) === 'Sold'` (so "Sold (Public Records)" /
 * "Sold (MLS)" / "Closed" all count), not by raw string equality. This
 * lets P ship now over raw events via accessors, without waiting on the
 * separate `PriceHistoryEvent` shape.
 *
 * The returned `date` is echoed back in WHATEVER form the accessor
 * yields (epoch number for redfin, ISO string for zillow) — recency is
 * ranked by `Date.parse` of strings / numeric value of numbers, but the
 * original value is preserved so the caller controls display
 * formatting. Returns `null` when no sold event has a usable date.
 *
 * Pure / dependency-free.
 */

import { mapEventType } from './event-type.js';

/** Coerce an accessor-returned date to a sortable epoch-ms timestamp. */
function toTimestamp(date: number | string | undefined): number | null {
  if (typeof date === 'number') {
    return Number.isFinite(date) ? date : null;
  }
  if (typeof date === 'string' && date.length > 0) {
    const parsed = Date.parse(date);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Find the most-recent `Sold` event in `events`, identifying sold
 * events via {@link mapEventType} (candidate E) on `get.type(e)`.
 *
 * @param events the raw price-history events (any portal shape)
 * @param get accessors pulling `date` / `price` / `type` off each event
 * @returns `{ date, price }` for the latest sold event — `date` echoed
 *   in the accessor's own form, `price` `null` when non-numeric — or
 *   `null` when no sold event has a usable date.
 *
 * @example
 * // redfin-style: epoch ms + eventDescription
 * lastSold(events, {
 *   date: (e) => e.eventDate,
 *   price: (e) => e.price,
 *   type: (e) => e.eventDescription,
 * });
 *
 * @example
 * // zillow-style: ISO date + event
 * lastSold(events, {
 *   date: (e) => e.date,
 *   price: (e) => e.price,
 *   type: (e) => e.event,
 * });
 */
export function lastSold<E>(
  events: E[],
  get: {
    date: (e: E) => number | string | undefined;
    price: (e: E) => number | undefined;
    type: (e: E) => string | undefined;
  }
): { date: string | number; price: number | null } | null {
  let best: { ts: number; date: string | number; price: number | null } | null =
    null;
  for (const e of events) {
    if (mapEventType(get.type(e)) !== 'Sold') continue;
    const rawDate = get.date(e);
    const ts = toTimestamp(rawDate);
    if (ts === null) continue;
    if (best === null || ts > best.ts) {
      const price = get.price(e);
      best = {
        ts,
        // `ts !== null` (guarded above) guarantees `rawDate` was a
        // defined number/string — `toTimestamp(undefined)` returns null.
        date: rawDate as string | number,
        price: typeof price === 'number' ? price : null,
      };
    }
  }
  return best ? { date: best.date, price: best.price } : null;
}
