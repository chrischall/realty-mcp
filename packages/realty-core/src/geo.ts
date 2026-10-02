/**
 * Light geographic sanity-checks for ZIP-keyed search queries
 * (cohort candidate H).
 *
 * The check: ZIP → plausible state(s). This catches the canonical
 * cross-continent search-fallback bug — a ZIP that resolves to homes in
 * the wrong region (ZIP 28746, a North-Carolina ZIP, returning Seattle
 * homes in Washington).
 *
 * `zipPlausibleStates` looks the ZIP's 3-digit prefix up in the USPS
 * prefix table below (`ZIP3_RANGES`) and widens the result with each
 * state's land neighbours, because a handful of real ZIPs straddle a
 * state line (42223 Fort Campbell KY/TN, 89439 NV/CA, …) and portals
 * geocode border listings either way. An UNASSIGNED prefix returns
 * `null` — "can't tell" — never a confident rejection (fleet-audit#660:
 * the old first-digit table omitted real prefixes such as 005 NY, 569
 * DC, 885 TX and 969 FM/MH/PW, and so rejected correct results).
 *
 * Surveyed from `redfin-mcp/src/geo.ts` but portal-agnostic.
 *
 * Pure (static tables + string ops) / dependency-free.
 */

/**
 * First-digit → set of states whose 5-digit ZIPs may begin with that
 * digit. A coarse summary of {@link ZIP3_RANGES}, kept for consumers that
 * import it; `zipPlausibleStates` uses the 3-digit table.
 */
export const FIRST_DIGIT_TO_STATES: Record<string, ReadonlySet<string>> = {
  '0': new Set(['CT', 'MA', 'ME', 'NH', 'NJ', 'NY', 'PR', 'RI', 'VT', 'VI', 'AE']),
  '1': new Set(['DE', 'NY', 'PA']),
  '2': new Set(['DC', 'MD', 'NC', 'SC', 'VA', 'WV']),
  '3': new Set(['AL', 'FL', 'GA', 'MS', 'TN', 'AA']),
  '4': new Set(['IN', 'KY', 'MI', 'OH']),
  '5': new Set(['DC', 'IA', 'MN', 'MT', 'ND', 'SD', 'WI']),
  '6': new Set(['IL', 'KS', 'MO', 'NE']),
  '7': new Set(['AR', 'LA', 'OK', 'TX']),
  '8': new Set(['AZ', 'CO', 'ID', 'NM', 'NV', 'TX', 'UT', 'WY']),
  '9': new Set([
    'AK', 'AS', 'CA', 'FM', 'GU', 'HI', 'MH', 'MP', 'OR', 'PW', 'WA', 'AP',
  ]),
};

/**
 * USPS 3-digit ZIP prefix → state(s), as inclusive `[from, to, states]`
 * ranges. Prefixes USPS has not assigned (000–004, 213, 269, 343, …) are
 * simply absent. Source: the USPS prefix assignments (National Five-Digit
 * ZIP Code and Post Office Directory / the published 3-digit prefix list).
 */
const ZIP3_RANGES: ReadonlyArray<readonly [number, number, readonly string[]]> = [
  [5, 5, ['NY']], // Holtsville (IRS)
  [6, 7, ['PR']],
  [8, 8, ['VI']],
  [9, 9, ['PR']],
  [10, 27, ['MA']],
  [28, 29, ['RI']],
  [30, 38, ['NH']],
  [39, 49, ['ME']],
  [50, 54, ['VT']],
  [55, 55, ['MA']], // Andover (IRS)
  [56, 59, ['VT']],
  [60, 69, ['CT']],
  [70, 89, ['NJ']],
  [90, 98, ['AE']],
  [100, 149, ['NY']],
  [150, 196, ['PA']],
  [197, 199, ['DE']],
  [200, 200, ['DC']],
  [201, 201, ['VA']], // Dulles
  [202, 205, ['DC']],
  [206, 212, ['MD']],
  [214, 219, ['MD']],
  [220, 246, ['VA']],
  [247, 268, ['WV']],
  [270, 289, ['NC']],
  [290, 299, ['SC']],
  [300, 319, ['GA']],
  [320, 339, ['FL']],
  [340, 340, ['AA']],
  [341, 342, ['FL']],
  [344, 344, ['FL']],
  [346, 347, ['FL']],
  [349, 349, ['FL']],
  [350, 352, ['AL']],
  [354, 369, ['AL']],
  [370, 385, ['TN']],
  [386, 397, ['MS']],
  [398, 399, ['GA']],
  [400, 427, ['KY']],
  [430, 459, ['OH']],
  [460, 479, ['IN']],
  [480, 499, ['MI']],
  [500, 528, ['IA']],
  [530, 532, ['WI']],
  [534, 535, ['WI']],
  [537, 549, ['WI']],
  [550, 567, ['MN']],
  [569, 569, ['DC']], // federal parcel ZIPs
  [570, 577, ['SD']],
  [580, 588, ['ND']],
  [590, 599, ['MT']],
  [600, 629, ['IL']],
  [630, 631, ['MO']],
  [633, 658, ['MO']],
  [660, 679, ['KS']],
  [680, 693, ['NE']],
  [700, 701, ['LA']],
  [703, 708, ['LA']],
  [710, 714, ['LA']],
  [716, 729, ['AR']],
  [730, 731, ['OK']],
  [733, 733, ['TX']], // Austin (IRS)
  [734, 749, ['OK']],
  [750, 799, ['TX']],
  [800, 816, ['CO']],
  [820, 831, ['WY']],
  [832, 838, ['ID']],
  [840, 847, ['UT']],
  [850, 853, ['AZ']],
  [855, 857, ['AZ']],
  [859, 860, ['AZ']],
  [863, 865, ['AZ']],
  [870, 875, ['NM']],
  [877, 884, ['NM']],
  [885, 885, ['TX']], // El Paso
  [889, 891, ['NV']],
  [893, 895, ['NV']],
  [897, 898, ['NV']],
  [900, 961, ['CA']],
  [962, 966, ['AP']],
  [967, 967, ['HI', 'AS']], // 96799 is American Samoa
  [968, 968, ['HI']],
  [969, 969, ['GU', 'MP', 'FM', 'MH', 'PW']],
  [970, 979, ['OR']],
  [980, 994, ['WA']],
  [995, 999, ['AK']],
];

/** Land borders between states (+ DC). Symmetrised into STATE_NEIGHBORS. */
const BORDERS: Record<string, readonly string[]> = {
  AL: ['FL', 'GA', 'MS', 'TN'],
  AZ: ['CA', 'CO', 'NM', 'NV', 'UT'],
  AR: ['LA', 'MO', 'MS', 'OK', 'TN', 'TX'],
  CA: ['NV', 'OR'],
  CO: ['KS', 'NE', 'NM', 'OK', 'UT', 'WY'],
  CT: ['MA', 'NY', 'RI'],
  DE: ['MD', 'NJ', 'PA'],
  DC: ['MD', 'VA'],
  FL: ['GA'],
  GA: ['NC', 'SC', 'TN'],
  ID: ['MT', 'NV', 'OR', 'UT', 'WA', 'WY'],
  IL: ['IA', 'IN', 'KY', 'MO', 'WI'],
  IN: ['KY', 'MI', 'OH'],
  IA: ['MN', 'MO', 'NE', 'SD', 'WI'],
  KS: ['MO', 'NE', 'OK'],
  KY: ['MO', 'OH', 'TN', 'VA', 'WV'],
  LA: ['MS', 'TX'],
  ME: ['NH'],
  MD: ['PA', 'VA', 'WV'],
  MA: ['NH', 'NY', 'RI', 'VT'],
  MI: ['OH', 'WI'],
  MN: ['ND', 'SD', 'WI'],
  MS: ['TN'],
  MO: ['NE', 'OK', 'TN'],
  MT: ['ND', 'SD', 'WY'],
  NE: ['SD', 'WY'],
  NV: ['OR', 'UT'],
  NH: ['VT'],
  NJ: ['NY', 'PA'],
  NM: ['OK', 'TX', 'UT'],
  NY: ['PA', 'VT'],
  NC: ['SC', 'TN', 'VA'],
  ND: ['SD'],
  OH: ['PA', 'WV'],
  OK: ['TX'],
  OR: ['WA'],
  PA: ['WV'],
  SD: ['WY'],
  TN: ['VA'],
  UT: ['WY'],
  VA: ['WV'],
  GU: ['MP'],
};

const STATE_NEIGHBORS = new Map<string, Set<string>>();
for (const [a, list] of Object.entries(BORDERS)) {
  for (const b of list) {
    if (!STATE_NEIGHBORS.has(a)) STATE_NEIGHBORS.set(a, new Set());
    if (!STATE_NEIGHBORS.has(b)) STATE_NEIGHBORS.set(b, new Set());
    STATE_NEIGHBORS.get(a)!.add(b);
    STATE_NEIGHBORS.get(b)!.add(a);
  }
}

function zip3States(prefix: number): readonly string[] | null {
  for (const [from, to, states] of ZIP3_RANGES) {
    if (prefix >= from && prefix <= to) return states;
  }
  return null;
}

/**
 * Return the set of state codes a 5-digit US ZIP could plausibly belong
 * to: the state(s) USPS assigns its 3-digit prefix to, plus their land
 * neighbours (border ZIPs and border geocoding).
 *
 * Tolerates a ZIP+4 (`"12345-6789"`) by considering the leading 5
 * digits. Returns `null` when the input isn't a 5-digit US ZIP we can
 * pattern-match (Canadian postal codes, short/garbage strings, missing
 * input, …) OR its prefix isn't assigned — callers treat `null` as
 * "can't tell", never as a mismatch.
 *
 * @example zipPlausibleStates('28746')      // Set { 'NC','GA','SC','TN','VA' }
 * @example zipPlausibleStates('K1A 0B1')    // null
 */
export function zipPlausibleStates(
  zip: string | undefined | null
): Set<string> | null {
  if (!zip) return null;
  const m = /^(\d{5})(?:-\d{4})?$/.exec(zip.trim());
  const five = m?.[1];
  if (!five) return null;
  const states = zip3States(Number(five.slice(0, 3)));
  if (!states) return null;
  const out = new Set<string>(states);
  for (const st of states) {
    for (const n of STATE_NEIGHBORS.get(st) ?? []) out.add(n);
  }
  return out;
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
 * Takes the LAST standalone 5-digit run (ZIPs trail an address), skipping
 * a leading street number — a 5-digit run at the start of the string or
 * of a comma segment that is followed by a word, as in
 * `"10001 Park Rd, Charlotte, NC"` (fleet-audit#660). Returns the leading
 * 5 digits of a ZIP+4, or `null` when no ZIP is found — and `null` only
 * ever skips the check, never fails it.
 *
 * @example extractZipFromLocation('Lake Lure, NC 28746')   // '28746'
 * @example extractZipFromLocation('Seattle, WA 98103-1234') // '98103'
 * @example extractZipFromLocation('10001 Park Rd, Charlotte, NC') // null
 * @example extractZipFromLocation('Asheville, NC')          // null
 */
export function extractZipFromLocation(
  location: string | undefined | null
): string | null {
  if (!location) return null;
  let zip: string | null = null;
  for (const m of location.matchAll(/\b(\d{5})(?:-\d{4})?\b/g)) {
    const before = location.slice(0, m.index);
    const after = location.slice(m.index + m[0].length);
    const leadsSegment = /(?:^|,)\s*$/.test(before);
    const followedByWord = /^\s+[A-Za-z]/.test(after);
    if (leadsSegment && followedByWord) continue; // a street number
    zip = m[1] ?? null;
  }
  return zip;
}
