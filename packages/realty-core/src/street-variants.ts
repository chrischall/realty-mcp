/**
 * USPS street-suffix variant expansion + compound split/join.
 *
 * Canonical implementation hoisted from zillow-mcp's `resolver.ts`
 * (which already lived through suffix_expansion → search_fallback
 * laddering) and redfin-mcp's `suffix.ts` (which has the cleanest
 * dedupe + remainder-preservation handling). Compass / homes / onehome
 * do not currently expand suffixes at the resolver layer — they will
 * once they migrate to this module.
 *
 * Drift this resolves:
 *
 *  - zillow had `Rd ↔ Road, Ln ↔ Lane, Dr ↔ Drive` only.
 *  - redfin added `Pkwy, Pl, Trl, Ter, Xing, Aly, Pt, Mtn, Vw, Vly`.
 *  - Round-3 #75 needs `Hts ↔ Heights` and `Mtn ↔ Mountain` for the
 *    Lake Lure / Banner Elk cohort, plus compound split (`Bluebird` ↔
 *    `Blue Bird`) for the Sleeping-Bear-ish mountain names.
 */

export const SUFFIX_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['Rd', 'Road'],
  ['Ln', 'Lane'],
  ['Dr', 'Drive'],
  ['Ct', 'Court'],
  ['Blvd', 'Boulevard'],
  ['Cir', 'Circle'],
  ['Hwy', 'Highway'],
  ['Pkwy', 'Parkway'],
  ['Ave', 'Avenue'],
  ['St', 'Street'],
  ['Pl', 'Place'],
  ['Trl', 'Trail'],
  ['Ter', 'Terrace'],
  ['Sq', 'Square'],
  ['Xing', 'Crossing'],
  ['Aly', 'Alley'],
  ['Pt', 'Point'],
  ['Mtn', 'Mountain'],
  ['Vw', 'View'],
  ['Vly', 'Valley'],
  ['Hts', 'Heights'],
  ['Mt', 'Mount'],
  ['Crk', 'Creek'],
];

/**
 * Alias-only pairs: non-USPS spellings seen in the wild. They expand to
 * the full form but are never a contraction target, and they are kept
 * OUT of the exported SUFFIX_PAIRS so consumers that fold that table
 * full -> abbr (compass-mcp's SUFFIX_FOLD, last-write-wins) keep folding
 * Parkway -> Pkwy, Circle -> Cir and Creek -> Crk (fleet-audit#216).
 * "Cr" is ambiguous — informal for Circle, sometimes Creek — so it
 * expands to both.
 */
const ALIAS_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['Pkw', 'Parkway'],
  ['Cr', 'Circle'],
  ['Cr', 'Creek'],
];

const ABBR_TO_FULL = new Map<string, string[]>();
const FULL_TO_ABBR = new Map<string, string>();
for (const [abbr, full] of [...SUFFIX_PAIRS, ...ALIAS_PAIRS]) {
  if (abbr === full) continue;
  const a = abbr.toLowerCase();
  const f = full.toLowerCase();
  const fulls = ABBR_TO_FULL.get(a) ?? [];
  if (!fulls.includes(full)) fulls.push(full);
  ABBR_TO_FULL.set(a, fulls);
  // First write wins: every canonical USPS pair precedes the aliases.
  if (!FULL_TO_ABBR.has(f)) FULL_TO_ABBR.set(f, abbr);
}

function splitStreetFromRemainder(address: string): {
  street: string;
  remainder: string;
} {
  const commaIdx = address.indexOf(',');
  if (commaIdx < 0) return { street: address, remainder: '' };
  return {
    street: address.slice(0, commaIdx),
    remainder: address.slice(commaIdx),
  };
}

function partsForToken(token: string): { core: string; trailingPunct: string } {
  const m = /^(.+?)([.,;:]*)$/.exec(token);
  if (!m || m[1] === undefined || m[2] === undefined) {
    return { core: token, trailingPunct: '' };
  }
  return { core: m[1], trailingPunct: m[2] };
}

function casePreserve(original: string, swap: string): string {
  return original[0] === original[0]?.toUpperCase()
    ? swap
    : swap.toLowerCase();
}

function swapSuffixVariants(street: string): string[] {
  const trimmed = street.trimEnd();
  const lastSpace = trimmed.lastIndexOf(' ');
  if (lastSpace < 0) return [];
  const head = trimmed.slice(0, lastSpace);
  const lastToken = trimmed.slice(lastSpace + 1);
  const { core, trailingPunct } = partsForToken(lastToken);
  const lower = core.toLowerCase();
  const abbr = FULL_TO_ABBR.get(lower);
  const swaps = ABBR_TO_FULL.get(lower) ?? (abbr ? [abbr] : []);
  return swaps.map(
    (swap) => `${head} ${casePreserve(core, swap)}${trailingPunct}`
  );
}

/**
 * Generate suffix variants of the input. Each variant swaps the
 * trailing street-suffix between its abbreviated and full form. An
 * ambiguous abbreviation ("Cr") yields one variant per expansion.
 * Returns ONLY the alternates — the caller is expected to also try
 * the original. Empty when no recognised suffix.
 */
export function expandSuffix(address: string): string[] {
  if (!address) return [];
  const { street, remainder } = splitStreetFromRemainder(address);
  return swapSuffixVariants(street).map((s) => `${s}${remainder}`);
}

/**
 * Words a compound street name is plausibly built from. A split is only
 * emitted when BOTH halves are in this set (or are a street-suffix full
 * form such as "View" / "Mountain"), so "Bluebird" → "Blue Bird" and
 * "Mountainview" → "Mountain View" survive while "Mou Ntainview" and
 * "Bou Levard" don't (fleet-audit#665).
 */
const COMPOUND_WORDS = new Set<string>([
  // colours / light
  'blue', 'red', 'green', 'white', 'black', 'gray', 'grey', 'silver', 'gold',
  'golden', 'sun', 'sunny', 'moon', 'star', 'sky', 'shadow', 'shady',
  // seasons / weather
  'spring', 'summer', 'winter', 'autumn', 'snow', 'rain', 'wind', 'windy',
  'storm', 'frost',
  // trees / plants
  'oak', 'pine', 'elm', 'ash', 'birch', 'cedar', 'maple', 'willow', 'cherry',
  'apple', 'peach', 'plum', 'rose', 'lily', 'ivy', 'fern', 'laurel', 'holly',
  'hazel', 'aspen', 'cypress', 'magnolia', 'poplar', 'spruce', 'walnut',
  'chestnut', 'berry', 'briar', 'thorn', 'flower', 'tree', 'leaf', 'moss',
  'grass', 'clover', 'heather',
  // animals
  'bird', 'bear', 'deer', 'fox', 'wolf', 'hawk', 'eagle', 'owl', 'crow',
  'raven', 'robin', 'wren', 'dove', 'swan', 'duck', 'quail', 'lark',
  'falcon', 'elk', 'buck', 'doe', 'stag', 'fawn', 'turkey', 'beaver',
  'otter', 'rabbit', 'squirrel', 'horse', 'pony', 'colt', 'bee',
  // land / water
  'wood', 'woods', 'forest', 'field', 'fields', 'meadow', 'meadows', 'brook',
  'creek', 'river', 'lake', 'pond', 'water', 'falls', 'bay', 'shore',
  'beach', 'sand', 'rock', 'rocky', 'stone', 'hill', 'hills', 'ridge',
  'crest', 'peak', 'top', 'side', 'dale', 'glen', 'vale', 'hollow', 'land',
  'lands', 'moor', 'marsh', 'island', 'cove', 'harbor', 'haven', 'port',
  'ford', 'bend', 'springs', 'well', 'mill', 'farm', 'ranch',
  'orchard', 'garden', 'gardens', 'grove', 'park', 'gate', 'bridge',
  'cross',
  // compass / position
  'north', 'south', 'east', 'west', 'high', 'low', 'upper', 'lower', 'over',
  'under', 'long', 'far', 'fair', 'mid', 'middle', 'new', 'old', 'big',
  'little', 'great', 'deep', 'clear', 'sweet', 'quiet', 'hidden', 'lone',
  'twin', 'king', 'queen', 'royal', 'crown', 'castle', 'church', 'chapel',
  'home', 'shire', 'fire', 'iron', 'copper', 'cotton', 'hunt', 'hunter',
  'sleepy', 'wild', 'whisper', 'whispering', 'echo', 'misty', 'mist',
]);

/** Lower-cased suffix words (both forms) — never split or joined onto. */
const SUFFIX_WORDS = new Set<string>([...ABBR_TO_FULL.keys(), ...FULL_TO_ABBR.keys()]);

function isCompoundWord(w: string): boolean {
  const lower = w.toLowerCase();
  return COMPOUND_WORDS.has(lower) || FULL_TO_ABBR.has(lower);
}

/**
 * Generate "Bluebird" ↔ "Blue Bird"-style variants.
 *
 * Splits: a street-name token of length >= 6 is split where BOTH halves
 * are known compound words (see `COMPOUND_WORDS`, plus the street-suffix
 * full forms). The right half is title-cased so casing stays plausible.
 * Joins: each adjacent alphabetic pair (>= 3 chars each) is joined, with
 * the left token's casing preserved.
 *
 * Street-suffix words ("Boulevard", "Road", "Mtn") are never split, and a
 * name is never joined onto the trailing suffix ("Mallard Road" ↛
 * "Mallardroad"). Each emitted variant can become a resolver round-trip
 * against a rate-limited portal, so this favours precision over recall
 * (fleet-audit#665).
 */
export function compoundSplits(address: string): string[] {
  if (!address) return [];
  const { street, remainder } = splitStreetFromRemainder(address);
  const out = new Set<string>();
  const tokens = street.trim().split(/\s+/);
  const isSuffix = (tok: string) => SUFFIX_WORDS.has(tok.toLowerCase());

  // Splits.
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!tok || tok.length < 6) continue;
    if (!/^[A-Za-z]+$/.test(tok)) continue;
    if (isSuffix(tok)) continue;
    for (let j = 3; j <= tok.length - 3; j++) {
      const left = tok.slice(0, j);
      const rightRaw = tok.slice(j);
      if (!isCompoundWord(left) || !isCompoundWord(rightRaw)) continue;
      // Title-case the right half so "Bluebird" → "Blue Bird" rather
      // than "Blue bird". Matches how a human writes the compound out.
      const right =
        rightRaw[0]!.toUpperCase() + rightRaw.slice(1).toLowerCase();
      const next = [...tokens];
      next.splice(i, 1, left, right);
      out.add(next.join(' ') + remainder);
    }
  }

  // Joins.
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    if (!a || !b) continue;
    if (!/^[A-Za-z]+$/.test(a) || !/^[A-Za-z]+$/.test(b)) continue;
    if (a.length < 3 || b.length < 3) continue;
    // Never glue the street name onto its trailing suffix.
    if (i + 1 === tokens.length - 1 && isSuffix(b)) continue;
    // Lower-case the second half on join so "Blue Bird" → "Bluebird"
    // (not "BlueBird"). Matches the typical USPS canonical form.
    const joined = a + b[0]!.toLowerCase() + b.slice(1).toLowerCase();
    const next = [...tokens];
    next.splice(i, 2, joined);
    out.add(next.join(' ') + remainder);
  }

  return [...out];
}

/**
 * Combined dedupe of original + suffix variants + compound variants.
 * The original is always first. The caller iterates in order, stopping
 * on the first that resolves.
 */
export function buildVariants(address: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (s: string) => {
    const key = s.trim();
    if (!key) return;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(key);
  };
  push(address);
  for (const v of expandSuffix(address)) push(v);
  for (const v of compoundSplits(address)) push(v);
  // Cross-product: compound splits of each suffix variant — catches
  // "Bluebird Rd" → "Blue Bird Road".
  for (const sv of expandSuffix(address)) {
    for (const cv of compoundSplits(sv)) push(cv);
  }
  return out;
}
