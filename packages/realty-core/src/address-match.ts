/**
 * Address tokenisation + match scoring — the canonical helper
 * reconciling four cohort implementations.
 *
 * Surveyed implementations:
 *
 *  - compass-mcp `src/tools/by-address.ts` `addressMatchesQuery` /
 *    `normalizeAddressForMatch` — NFKD diacritic strip, comma/slash
 *    collapse, street-type canonicalisation, token-equality, numeric
 *    token required.
 *  - homes-mcp `src/tools/by-address.ts` — relies on homes.com's own
 *    slug routing, with a post-hoc token-overlap check on the
 *    returned street_address.
 *  - onehome-mcp `src/tools/by-address.ts` — fuzzy normalisation
 *    via `joinNonEmpty` + comparison against reconstructed street
 *    parts.
 *  - redfin-mcp `src/resolve.ts` `scoreStreetMatch` — token-overlap
 *    scorer with a strict numeric-prefix anchor.
 *
 * Differences reconciled here:
 *
 *  - Compass requires EVERY query token to appear → too strict for
 *    redfin's autocomplete results where the candidate often drops the
 *    unit number.
 *  - Redfin scored 0..1 with a threshold of `>= 0.5` → too lax,
 *    accepts even tokens (homes #50 closed by tightening to `> 0.5`).
 *  - Homes drops short tokens (< 3 chars) at tokenise time so suffix
 *    abbrev noise vanishes ("Ln" / "St" never enter the score).
 *
 * Canonical policy:
 *
 *  1. Strip unit / floor designators and their ids ("Apt 5", "Unit
 *     12", "lgh 1201", "3 tr") before scoring — portals return the
 *     street line only, so a unit on the query side must never
 *     hard-reject (fleet-audit#920). When BOTH sides carry a unit id
 *     and they disagree, reject (same building, different unit).
 *  2. Drop sub-3-char tokens (homes convergence) — absorbs USPS
 *     abbreviation drift without needing the SUFFIX_PAIRS table at
 *     this layer — EXCEPT the house number, which always survives.
 *  3. Anchor on the house number only (redfin's `scoreStreetMatch`):
 *     the first digit-leading token of the form `\d+[a-z]?`, whether
 *     it leads ("12 Main", "12B Main") or trails ("Storgatan 12",
 *     "Kungsgatan 3A" — fleet-audit#214, #954). It MUST appear
 *     verbatim in the candidate. Other digit tokens (a ZIP) are ordinary
 *     scored tokens, so a ZIP mismatch lowers the score but no longer
 *     hard-rejects on its own. A bare "#101" is a unit, like "Apt 101".
 *     A floor number is at most three digits, so "FL 33602" stays a
 *     state code + ZIP.
 *  4. Reject conflicting directionals and street names with words
 *     the other side lacks, in both directions (fleet-audit#215).
 *  5. Score = |query ∩ candidate| / |query| over the kept tokens.
 *  6. Threshold > 0.5 (strict majority) — homes #50.
 */

/** A house number: digits with at most one letter suffix ("12", "12b", "3a"). */
const HOUSE_NUMBER = /^\d+[a-z]?$/;

/** A unit id after a designator: "5", "5b", "101", "b", "b12". */
const UNIT_ID = /^(?:\d+[a-z]?|[a-z]|[a-z]\d+)$/;

/**
 * A floor number after a floor designator: at most three digits (or a
 * single letter, "Fl B"). Deliberately narrower than UNIT_ID so the
 * state code and ZIP in "Tampa, FL 33602" are never read as "floor
 * 33602" and stripped — that would let the same house number in a
 * different Florida city match.
 */
const FLOOR_ID = /^(?:\d{1,3}[a-z]?|[a-z])$/;

/** Placeholder designator a bare "#" is rewritten to, so "#101" is a unit. */
const HASH_UNIT = 'unit';

/**
 * Designators that PRECEDE a unit id ("Apt 5", "Unit 12", "lgh 1201").
 * The id is compared across sides when both carry one.
 */
const UNIT_PREFIX_DESIGNATORS: ReadonlySet<string> = new Set([
  'apt', 'apartment', 'unit', 'ste', 'suite', 'bldg', 'building',
  'lot', 'rm', 'room', 'spc', 'space', 'trlr', 'dept',
  // Swedish "lägenhet" (NFKD-stripped to "lagenhet") / "lgh 1201".
  'lgh', 'lagenhet',
]);

/**
 * Floor designators that PRECEDE a floor number ("Fl 3", "vån 2").
 * Floors are stripped but never compared — "3 tr" and "lgh 1201" can
 * describe the same apartment.
 */
const FLOOR_PREFIX_DESIGNATORS: ReadonlySet<string> = new Set([
  'fl', 'floor', 'vaning',
]);

/** Floor designators that FOLLOW the floor number: Swedish "3 tr". */
const FLOOR_POSTFIX_DESIGNATORS: ReadonlySet<string> = new Set(['tr']);

interface Analyzed {
  /** Tokens kept for scoring (units / floors stripped, short noise dropped). */
  tokens: string[];
  /** The house-number anchor, if the address has one. */
  houseNumber: string | null;
  /** Unit ids named by a prefix designator ("Apt 5" → "5"). */
  units: Set<string>;
}

/**
 * Comma segment → raw tokens, with a spaced letter suffix at the end of
 * the segment folded into the number it follows ("Kungsgatan 3 A, …"
 * → "3a", fleet-audit#954). A single letter elsewhere is left alone so
 * "123 A St" keeps its street name.
 */
function segmentTokens(segment: string): string[] {
  const raw = rawTokens(segment);
  const n = raw.length;
  if (n >= 2 && /^\d+$/.test(raw[n - 2]!) && /^[a-z]$/.test(raw[n - 1]!)) {
    return [...raw.slice(0, n - 2), raw[n - 2]! + raw[n - 1]!];
  }
  return raw;
}

/**
 * Tokenise and classify an address: strip unit / floor designators
 * with their ids, find the house-number anchor, and drop sub-3-char
 * noise (except that anchor).
 */
function analyze(input: string): Analyzed {
  const units = new Set<string>();
  if (!input) return { tokens: [], houseNumber: null, units };
  // A bare "#101" names a unit just like "Apt 101", so rewrite the "#"
  // into a designator before punctuation is stripped.
  const raw = input.replace(/#/g, ` ${HASH_UNIT} `).split(',').flatMap(segmentTokens);

  const kept: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i]!;
    const next = raw[i + 1];
    // "Apt #5" → "apt unit 5": the first designator is redundant.
    if (UNIT_PREFIX_DESIGNATORS.has(t) && next === HASH_UNIT) continue;
    if (UNIT_PREFIX_DESIGNATORS.has(t) && next !== undefined && UNIT_ID.test(next)) {
      units.add(next);
      i++;
      continue;
    }
    if (FLOOR_PREFIX_DESIGNATORS.has(t) && next !== undefined && FLOOR_ID.test(next)) {
      i++;
      continue;
    }
    if (
      FLOOR_POSTFIX_DESIGNATORS.has(t) &&
      kept.length > 0 &&
      /^\d+$/.test(kept[kept.length - 1]!)
    ) {
      kept.pop();
      continue;
    }
    kept.push(t);
  }

  // The house number is the first digit-leading token of the street
  // line, whatever the format puts around it: "12 Main", "12B Main",
  // "Storgatan 12", "Kungsgatan 3A" (fleet-audit#214, #954). It must
  // always survive the short-token filter so the anchor has something
  // to work with.
  const houseNumber = kept.find((t) => HOUSE_NUMBER.test(t)) ?? null;
  const tokens = kept.filter((t) => t.length >= 3 || t === houseNumber);
  return { tokens, houseNumber, units };
}

/**
 * Lowercase, strip punctuation, split on whitespace, strip unit /
 * floor designators with their ids, and drop tokens shorter than 3
 * characters EXCEPT the house number (which must always survive so
 * the anchor below has something to work with, wherever the address
 * format puts it).
 */
export function tokenize(input: string): string[] {
  return analyze(input).tokens;
}

/** Directional words → canonical abbreviation. */
const DIRECTIONALS: ReadonlyMap<string, string> = new Map([
  ['n', 'n'], ['north', 'n'],
  ['s', 's'], ['south', 's'],
  ['e', 'e'], ['east', 'e'],
  ['w', 'w'], ['west', 'w'],
  ['ne', 'ne'], ['northeast', 'ne'],
  ['nw', 'nw'], ['northwest', 'nw'],
  ['se', 'se'], ['southeast', 'se'],
  ['sw', 'sw'], ['southwest', 'sw'],
]);

/**
 * Thoroughfare types (USPS full + abbreviated forms) that terminate a
 * street name. Name-forming words that also appear in SUFFIX_PAIRS
 * (Mount, View, Valley, Creek, …) are deliberately absent — they are
 * as often part of the name ("Valley View Dr") as its type.
 */
const STREET_TYPES: ReadonlySet<string> = new Set([
  'road', 'rd', 'lane', 'ln', 'drive', 'dr', 'court', 'ct',
  'boulevard', 'blvd', 'circle', 'cir', 'highway', 'hwy',
  'parkway', 'pkwy', 'pkw', 'avenue', 'ave', 'street', 'st',
  'place', 'pl', 'trail', 'trl', 'terrace', 'ter', 'alley', 'aly',
  'way', 'loop', 'crossing', 'xing', 'square', 'sq',
]);

/** Abbreviated name words → full form, so "Mt Mitchell" ≡ "Mount Mitchell". */
const NAME_ALIASES: ReadonlyMap<string, string> = new Map([
  ['mt', 'mount'], ['mtn', 'mountain'], ['pt', 'point'],
  ['hts', 'heights'], ['vw', 'view'], ['vly', 'valley'], ['ft', 'fort'],
  // Only ever applied to name words (the type search starts after the
  // first name word), so "St Charles Ave" ≡ "Saint Charles Ave".
  ['st', 'saint'],
]);

/** Words portals drop inconsistently, so neither side must cover them:
 *  generational suffixes ("Martin Luther King Jr Blvd" vs "Martin Luther
 *  King Blvd") and the US route prefix ("US Hwy 50" vs "Hwy 50"). */
const OPTIONAL_NAME_WORDS: ReadonlySet<string> = new Set(['jr', 'sr', 'us']);

function rawTokens(input: string): string[] {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

const canonName = (t: string): string => NAME_ALIASES.get(t) ?? t;

/** Unit designators that may follow a suffix directional ("Main St NW Apt 4"). */
const UNIT_DESIGNATORS: ReadonlySet<string> = new Set([
  ...UNIT_PREFIX_DESIGNATORS,
  ...FLOOR_PREFIX_DESIGNATORS,
]);

/** Two-letter quadrant abbreviations, unambiguous as a suffix directional. */
const QUADRANT_ABBRS: ReadonlySet<string> = new Set(['ne', 'nw', 'se', 'sw']);

interface StreetParts {
  /** Canonical prefix directional ("123 N Main St"), if any. */
  prefix: string | null;
  /** Canonical suffix directional ("123 Main St NW"), if any. */
  suffix: string | null;
  /** Street-name words between house number (+ prefix directional)
   *  and the thoroughfare type; null when no type delimits them. */
  name: string[] | null;
}

/**
 * Parse a number-first street line ("123 N Oak Hill Dr SW, …") into
 * its prefix/suffix directionals and name words. Only the text before
 * the first comma is considered. A prefix is the word right after the
 * house number. A word right after the type counts as a suffix only
 * when it ENDS the street segment or is followed by a unit designator
 * (or a bare unit number) — otherwise it is the start of comma-less
 * locality text, as in "Main St North Charleston SC" or "Main St West
 * Palm Beach FL" (onehome's listingHaystack, redfin's row.name). The
 * exception is an abbreviated quadrant (NE/NW/SE/SW), which no city
 * name starts with, so "Main St SE Washington DC" still carries its
 * suffix. A state code like "NE" after a city is never read as one.
 * Returns null for number-last formats ("Storgatan 12"), which carry
 * no such structure.
 */
function streetParts(input: string): StreetParts | null {
  const raw = rawTokens(input.split(',')[0] ?? '');
  if (raw.length < 2 || !/^\d/.test(raw[0]!)) return null;
  let prefix: string | null = null;
  let i = 1;
  const pre = DIRECTIONALS.get(raw[1]!);
  if (pre && raw[2] !== undefined && !STREET_TYPES.has(raw[2])) {
    prefix = pre;
    i = 2;
  }
  // The type is the first STREET_TYPES word after at least one name word.
  let k = -1;
  for (let j = i + 1; j < raw.length; j++) {
    if (STREET_TYPES.has(raw[j]!)) {
      k = j;
      break;
    }
  }
  if (k < 0) return { prefix, suffix: null, name: null };
  let suffix: string | null = null;
  const post = raw[k + 1] !== undefined ? DIRECTIONALS.get(raw[k + 1]!) : undefined;
  if (post) {
    const next = raw[k + 2];
    const endsSegment =
      next === undefined || UNIT_DESIGNATORS.has(next) || /^\d+[a-z]?$/.test(next);
    // An abbreviated quadrant (NE/NW/SE/SW, as in DC) never begins a
    // city name, so it is a suffix even before comma-less locality text.
    if (endsSegment || QUADRANT_ABBRS.has(raw[k + 1]!)) suffix = post;
  }
  return { prefix, suffix, name: raw.slice(i, k).map(canonName) };
}

/**
 * Street-structure gate (fleet-audit#215), applied symmetrically so it
 * holds for callers that pass the candidate first:
 *  - conflicting directionals reject, compared slot by slot (prefix vs
 *    prefix, suffix vs suffix) so a directional in one slot can never
 *    vouch for a conflicting one in the other; a side that omits a
 *    slot's directional is not a conflict;
 *  - every street-name word on either side must appear on the other
 *    ("Oak St" vs "Oak Hill Dr" rejects — a different street), except
 *    generational suffixes (Jr, Sr), which portals drop inconsistently.
 */
function streetStructureConflicts(a: string, b: string): boolean {
  const pa = streetParts(a);
  const pb = streetParts(b);
  if (pa && pb) {
    if (pa.prefix && pb.prefix && pa.prefix !== pb.prefix) return true;
    if (pa.suffix && pb.suffix && pa.suffix !== pb.suffix) return true;
  }
  const namesCovered = (p: StreetParts | null, other: string): boolean => {
    if (!p?.name) return true;
    const words = new Set(rawTokens(other).map(canonName));
    return p.name.every((w) => OPTIONAL_NAME_WORDS.has(w) || words.has(w));
  };
  return !namesCovered(pa, b) || !namesCovered(pb, a);
}

export interface AddressMatchResult {
  matched: boolean;
  score: number;
}

/**
 * Token-equality match with an anchored house number.
 */
export function addressMatch(
  input: string,
  candidate: string
): AddressMatchResult {
  const a = analyze(input);
  const inputTokens = a.tokens;
  if (inputTokens.length === 0) return { matched: false, score: 0 };

  const c = analyze(candidate);
  const candTokens = new Set(c.tokens);

  // Anchor: the input's house number must appear verbatim in the
  // candidate, and two house numbers never disagree. Guards "12 Main"
  // silently matching inside "1234 Main Street" — the prefix-collision
  // class homes #50 + compass #45 both addressed — and "Kungsgatan 3A"
  // matching "Kungsgatan 3" (fleet-audit#954). Unit and ZIP digits are
  // NOT anchors: a condo query must match its street-only listing
  // (fleet-audit#920).
  if (a.houseNumber !== null && !candTokens.has(a.houseNumber)) {
    return { matched: false, score: 0 };
  }
  if (a.houseNumber !== null && c.houseNumber !== null && a.houseNumber !== c.houseNumber) {
    return { matched: false, score: 0 };
  }

  // Same building, different unit: only when BOTH sides name a unit and
  // share none of them ("Apt 5" vs "Apt 6"; "Bldg 2 Apt 5" vs "Apt 5" is fine).
  if (a.units.size > 0 && c.units.size > 0) {
    let shared = false;
    for (const u of a.units) if (c.units.has(u)) shared = true;
    if (!shared) return { matched: false, score: 0 };
  }

  if (streetStructureConflicts(input, candidate)) {
    return { matched: false, score: 0 };
  }

  let hits = 0;
  for (const t of inputTokens) if (candTokens.has(t)) hits++;
  const score = hits / inputTokens.length;

  // Strict majority — exact 50% does NOT pass. homes #50.
  return { matched: score > 0.5, score };
}
