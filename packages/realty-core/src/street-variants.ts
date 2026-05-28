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
  ['Pkw', 'Parkway'],
  ['Cr', 'Creek'],
];

const ABBR_TO_FULL = new Map<string, string>();
const FULL_TO_ABBR = new Map<string, string>();
for (const [abbr, full] of SUFFIX_PAIRS) {
  if (abbr === full) continue;
  ABBR_TO_FULL.set(abbr.toLowerCase(), full);
  FULL_TO_ABBR.set(full.toLowerCase(), abbr);
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

function swapSuffixVariant(street: string): string | null {
  const trimmed = street.trimEnd();
  const lastSpace = trimmed.lastIndexOf(' ');
  if (lastSpace < 0) return null;
  const head = trimmed.slice(0, lastSpace);
  const lastToken = trimmed.slice(lastSpace + 1);
  const { core, trailingPunct } = partsForToken(lastToken);
  const lower = core.toLowerCase();
  const swap = ABBR_TO_FULL.get(lower) ?? FULL_TO_ABBR.get(lower);
  if (!swap) return null;
  return `${head} ${casePreserve(core, swap)}${trailingPunct}`;
}

/**
 * Generate suffix variants of the input. Each variant swaps the
 * trailing street-suffix between its abbreviated and full form.
 * Returns ONLY the alternates — the caller is expected to also try
 * the original. Empty when no recognised suffix.
 */
export function expandSuffix(address: string): string[] {
  if (!address) return [];
  const { street, remainder } = splitStreetFromRemainder(address);
  const swapped = swapSuffixVariant(street);
  if (!swapped) return [];
  return [`${swapped}${remainder}`];
}

/**
 * Generate "Bluebird" ↔ "Blue Bird"-style variants. For each token in
 * the street portion of length >= 6, emit splits at every position
 * that yields two >=3-char alphabetic halves. The right half is
 * title-cased so casing stays plausible across both branches. For
 * multi-token streets, also emit a join variant for each adjacent
 * alphabetic pair, preserving the left token's casing on the join.
 *
 * Deliberately greedy (returns every viable split) — the address-match
 * scorer at the consumer end is cheap and the resolver tries variants
 * in order. False positives cost one extra resolver call; missing a
 * variant costs a wrong/missed result.
 */
export function compoundSplits(address: string): string[] {
  if (!address) return [];
  const { street, remainder } = splitStreetFromRemainder(address);
  const out = new Set<string>();
  const tokens = street.trim().split(/\s+/);

  // Splits.
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!tok || tok.length < 6) continue;
    if (!/^[A-Za-z]+$/.test(tok)) continue;
    for (let j = 3; j <= tok.length - 3; j++) {
      const left = tok.slice(0, j);
      const rightRaw = tok.slice(j);
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
