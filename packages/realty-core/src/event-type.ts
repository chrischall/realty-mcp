/**
 * Listing-event normalisation — the canonical cross-MCP price-history
 * event taxonomy + mapper, reconciling four cohort copies (#48 / #26).
 *
 * Every portal emits free-text status strings on its price-history
 * series ("Listed", "Price Changed", "Sold (Public Records)", "Off
 * Market", …). Four MCPs independently defined the same enum + a
 * case-insensitive substring mapper:
 *
 *  - zillow-mcp `src/tools/history-format.ts` `normalizeEventType` —
 *    8-member union; defaults unknown input to `Listed`.
 *  - redfin-mcp `src/tools/history.ts` `mapEventType` — adds an
 *    `Unknown` sentinel for input it can't classify (keeping the raw
 *    string around for callers).
 *  - compass-mcp `src/tools/history.ts` `normalizeEventType` — the
 *    RICHEST synonym set: adds `coming soon` / `active` / `new listing`
 *    / `for sale` → Listed and `off market` / `expired` / `cancel` →
 *    Delisted.
 *  - homes-mcp `src/tools/history.ts` `mapEventType` — adds `price
 *    drop` and `off market` handling; returns null on miss.
 *
 * Canonical policy:
 *
 *  - Type = the UNION of all four synonym sets, plus the `Unknown`
 *    sentinel (redfin) so unrecognised input never silently
 *    mis-buckets as `Listed`.
 *  - Case-insensitive SUBSTRING matching against the keyword set, with
 *    two word-boundary exceptions — `\bactive\b` and `\bclosed\b` — so
 *    "Inactive"/"Deactivated" don't match Listed and "Foreclosed"
 *    doesn't match Sold.
 *  - Specificity-ordered: tighter matches first, so "Relisted" beats
 *    "Listed", "Pending sale" beats "Sold", and "Price reduced" beats a
 *    bare "reduced".
 *
 * Pure / dependency-free.
 */

/**
 * The shared price-history event taxonomy — the union of every cohort
 * MCP's enum plus an `Unknown` sentinel for input that doesn't map.
 */
export type NormalizedEventType =
  | 'Listed'
  | 'PriceChange'
  | 'Pending'
  | 'Contingent'
  | 'Sold'
  | 'Withdrawn'
  | 'Relisted'
  | 'Delisted'
  | 'Unknown';

/**
 * Map a portal's free-text event/status string to the shared
 * {@link NormalizedEventType}. Case-insensitive substring matching
 * (`active`/`closed` are word-boundary-anchored so "Inactive" /
 * "Foreclosed" don't false-match); order matters (most-specific first).
 * Returns `'Unknown'` for missing or unrecognised input rather than
 * guessing.
 *
 * @example mapEventType('Sold (Public Records)') // 'Sold'
 * @example mapEventType('Price Reduced')          // 'PriceChange'
 * @example mapEventType('Coming Soon')            // 'Listed'
 * @example mapEventType('Off Market')             // 'Delisted'
 * @example mapEventType('Foreclosure auction')    // 'Unknown'
 */
export function mapEventType(raw: string | undefined | null): NormalizedEventType {
  if (!raw) return 'Unknown';
  const s = raw.toLowerCase();

  // Relisted must precede Listed: "relisted" contains "listed".
  if (s.includes('relist') || s.includes('re-list')) return 'Relisted';
  // Withdrawn / removed (zillow's "listing removed", homes/compass cancel).
  if (
    s.includes('withdrawn') ||
    s.includes('listing removed') ||
    s.includes('cancel')
  )
    return 'Withdrawn';
  // Delisted / off-market / expired (compass + homes additions).
  if (
    s.includes('delist') ||
    s.includes('off market') ||
    s.includes('off-market') ||
    s.includes('expired')
  )
    return 'Delisted';
  // Pending / contingent before Sold so "pending sale" doesn't hit "sold".
  if (s.includes('pending')) return 'Pending';
  if (s.includes('contingent')) return 'Contingent';
  // `\bclosed\b` (not bare substring) so "Foreclosed" doesn't match Sold.
  if (s.includes('sold') || /\bclosed\b/.test(s)) return 'Sold';
  // Price-movement synonyms (the full cohort union).
  if (
    s.includes('price change') ||
    s.includes('price changed') ||
    s.includes('price decrease') ||
    s.includes('price increase') ||
    s.includes('price reduced') ||
    s.includes('price reduction') ||
    s.includes('price drop')
  )
    return 'PriceChange';
  // Listed / active / coming-soon / for-sale (compass's richest set).
  if (
    s.includes('listed') ||
    s.includes('new listing') ||
    // `\bactive\b` (not bare substring) so "Inactive" / "Deactivated"
    // don't match Listed.
    /\bactive\b/.test(s) ||
    s.includes('coming soon') ||
    s.includes('for sale')
  )
    return 'Listed';

  return 'Unknown';
}
