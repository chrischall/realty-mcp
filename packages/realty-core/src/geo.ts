/**
 * Light geographic sanity-checks for ZIP-keyed search queries
 * (cohort candidate H).
 *
 * The check: ZIP → plausible state(s). This catches the canonical
 * cross-continent search-fallback bug — a ZIP that resolves to homes in
 * the wrong region (ZIP 28746, a North-Carolina ZIP, returning Seattle
 * homes in Washington). The static table below maps each ZIP's FIRST
 * DIGIT to the small set of states whose 5-digit ZIPs share that
 * prefix — coarse on purpose: enough to catch cross-continent
 * fallbacks (the bug class) without false-positiving on legitimate
 * fringe ZIPs.
 *
 * Surveyed from `redfin-mcp/src/geo.ts` (the only consumer today) but
 * portal-agnostic — every search-capable cohort MCP can use it, which is
 * why it ships canonical now.
 *
 * Pure (static table + string ops) / dependency-free.
 */

/**
 * First-digit → set of states whose 5-digit ZIPs may begin with that
 * digit. Derived from public USPS ZIP-prefix references; comprehensive
 * enough for cross-continent sanity checks.
 */
export const FIRST_DIGIT_TO_STATES: Record<string, ReadonlySet<string>> = {
  '0': new Set(['CT', 'MA', 'ME', 'NH', 'NJ', 'PR', 'RI', 'VT', 'VI', 'AE']),
  '1': new Set(['DE', 'NY', 'PA']),
  '2': new Set(['DC', 'MD', 'NC', 'SC', 'VA', 'WV']),
  '3': new Set(['AL', 'FL', 'GA', 'MS', 'TN', 'AA']),
  '4': new Set(['IN', 'KY', 'MI', 'OH']),
  '5': new Set(['IA', 'MN', 'MT', 'ND', 'SD', 'WI']),
  '6': new Set(['IL', 'KS', 'MO', 'NE']),
  '7': new Set(['AR', 'LA', 'OK', 'TX']),
  '8': new Set(['AZ', 'CO', 'ID', 'NM', 'NV', 'UT', 'WY']),
  '9': new Set(['AK', 'AS', 'CA', 'GU', 'HI', 'MP', 'OR', 'WA', 'AP']),
};

/**
 * Return the set of state codes a 5-digit US ZIP could plausibly belong
 * to, based on its first digit.
 *
 * Tolerates a ZIP+4 (`"12345-6789"`) by considering the leading 5
 * digits. Returns `null` when the input isn't a 5-digit US ZIP we can
 * pattern-match (Canadian postal codes, short/garbage strings, missing
 * input, …).
 *
 * @example zipPlausibleStates('28746')      // Set { 'DC','MD','NC','SC','VA','WV' }
 * @example zipPlausibleStates('K1A 0B1')    // null
 */
export function zipPlausibleStates(
  zip: string | undefined | null
): Set<string> | null {
  if (!zip) return null;
  const m = /^(\d{5})(?:-\d{4})?$/.exec(zip.trim());
  const five = m?.[1];
  if (!five) return null;
  const states = FIRST_DIGIT_TO_STATES[five.charAt(0)];
  return states ? new Set(states) : null;
}

/**
 * Quick sanity check: are a returned listing's states plausible for the
 * queried ZIP? Catches the cross-continent search-fallback bug (ZIP
 * 28746 → Seattle homes).
 *
 * Returns `false` ONLY when we are CONFIDENT the result doesn't match —
 * the ZIP pattern-matched to a plausible-state set, at least one home
 * state was supplied, and the in-state homes do NOT form a MAJORITY of
 * the usable home states. In every other case (non-US/unparseable ZIP,
 * no home states, an in-state majority) it returns `true`, i.e. "no
 * confident rejection" — so a `false` is always actionable and never a
 * false alarm on ambiguous data.
 *
 * A majority threshold (rather than the weaker "any single plausible
 * home ⇒ matched") keeps the cross-continent guard firing on
 * partially-poisoned result sets: a lone in-state listing can no longer
 * rescue a result that is mostly in the wrong region.
 *
 * @param zip the queried ZIP (free-form; non-ZIP input → `true`)
 * @param homeStates the returned listings' state codes (nullish entries
 *   are ignored; comparison is case-insensitive)
 *
 * @example homesMatchZipState('28746', ['NC'])              // true
 * @example homesMatchZipState('28746', ['WA'])              // false  (the canonical bug)
 * @example homesMatchZipState('28746', ['WA', 'WA', 'NC'])  // false  (no in-state majority)
 */
export function homesMatchZipState(
  zip: string | undefined | null,
  homeStates: Array<string | undefined | null>
): boolean {
  const plausible = zipPlausibleStates(zip);
  if (!plausible) return true; // can't pattern-match → don't reject
  let usable = 0;
  let inState = 0;
  for (const s of homeStates) {
    if (!s) continue;
    usable++;
    if (plausible.has(s.toUpperCase())) inState++;
  }
  // No usable home states → nothing to reject. Otherwise require the
  // in-state homes to be a strict majority of the usable set; a tie or
  // worse is a confident cross-region miss.
  if (usable === 0) return true;
  return inState * 2 > usable;
}

/**
 * Pull a 5-digit US ZIP out of a free-text location string. Used to gate
 * the ZIP-state check — run it only when the caller actually typed a ZIP.
 *
 * Returns the leading 5 digits of a ZIP+4 when present. Returns `null`
 * when no standalone 5-digit ZIP is found (a `\b` word-boundary keeps it
 * from matching a 5-digit run inside a longer number).
 *
 * @example extractZipFromLocation('Lake Lure, NC 28746')   // '28746'
 * @example extractZipFromLocation('Seattle, WA 98103-1234') // '98103'
 * @example extractZipFromLocation('Asheville, NC')          // null
 */
export function extractZipFromLocation(
  location: string | undefined | null
): string | null {
  if (!location) return null;
  const m = /\b(\d{5})(?:-\d{4})?\b/.exec(location);
  return m?.[1] ?? null;
}
