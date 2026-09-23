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
 *  1. Drop sub-3-char non-numeric tokens (homes convergence) —
 *     absorbs USPS abbreviation drift without needing the
 *     SUFFIX_PAIRS table at this layer.
 *  2. Anchor on every numeric token (redfin's `scoreStreetMatch`) —
 *     the street number MUST match exactly, whether it leads
 *     ("12 Main") or trails ("Storgatan 12").
 *  3. Reject conflicting directionals and street names with words
 *     the other side lacks, in both directions (fleet-audit#215).
 *  4. Score = |query ∩ candidate| / |query| over the kept tokens.
 *  5. Threshold > 0.5 (strict majority) — homes #50.
 */

/**
 * Lowercase, strip punctuation, split on whitespace, drop tokens
 * shorter than 3 characters EXCEPT all-digit tokens (the street
 * number — must always survive so the anchor below has something to
 * work with, wherever the address format puts it).
 */
export function tokenize(input: string): string[] {
  if (!input) return [];
  const raw = rawTokens(input);
  // Keep every all-digit token, whatever its position: a short house
  // number must stay anchored both in number-first ("12 Main") and
  // number-last ("Storgatan 12", hemnet) formats (fleet-audit#214).
  return raw.filter((t) => t.length >= 3 || /^\d+$/.test(t));
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

/** Generational suffixes portals disagree on ("Martin Luther King Jr
 *  Blvd" vs "Martin Luther King Blvd"); not required to be covered. */
const OPTIONAL_NAME_WORDS: ReadonlySet<string> = new Set(['jr', 'sr']);

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
  'apt', 'apartment', 'unit', 'ste', 'suite', 'bldg', 'building',
  'lot', 'fl', 'floor', 'rm', 'room', 'spc', 'space', 'trlr', 'dept',
]);

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
 * Palm Beach FL" (onehome's listingHaystack, redfin's row.name). A
 * trailing state code like "NE" is likewise never read as one.
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
    if (endsSegment) suffix = post;
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
 * Token-equality match with anchored numeric prefix.
 */
export function addressMatch(
  input: string,
  candidate: string
): AddressMatchResult {
  const inputTokens = tokenize(input);
  if (inputTokens.length === 0) return { matched: false, score: 0 };

  const candTokens = new Set(tokenize(candidate));

  // Anchor: every numeric-leading input token must appear verbatim in
  // the candidate. Guards "12 Main" silently matching inside "1234
  // Main Street" — the prefix-collision class homes #50 + compass #45
  // both addressed.
  for (const t of inputTokens) {
    if (/^\d/.test(t) && !candTokens.has(t)) {
      return { matched: false, score: 0 };
    }
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
