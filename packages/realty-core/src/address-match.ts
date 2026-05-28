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
 *  1. Drop sub-3-char tokens (homes convergence) — absorbs USPS
 *     abbreviation drift without needing the SUFFIX_PAIRS table at
 *     this layer.
 *  2. Anchor on the leading numeric token (redfin's
 *     `scoreStreetMatch`) — street number MUST match exactly.
 *  3. Score = |query ∩ candidate| / |query| over the kept tokens.
 *  4. Threshold > 0.5 (strict majority) — homes #50.
 */

/**
 * Lowercase, strip punctuation, split on whitespace, drop tokens
 * shorter than 3 characters EXCEPT for the leading numeric token
 * (the street number — must always survive so the anchor below has
 * something to work with).
 */
export function tokenize(input: string): string[] {
  if (!input) return [];
  const raw = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
  return raw.filter((t, i) => {
    if (t.length >= 3) return true;
    // Keep a short token if it's the first token and looks numeric —
    // a short street number like "12 Main" must stay anchored.
    return i === 0 && /^\d+$/.test(t);
  });
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

  // Anchor: every leading-numeric input token must appear verbatim in
  // the candidate. Guards "12 Main" silently matching inside "1234
  // Main Street" — the prefix-collision class homes #50 + compass #45
  // both addressed.
  for (const t of inputTokens) {
    if (/^\d/.test(t) && !candTokens.has(t)) {
      return { matched: false, score: 0 };
    }
  }

  let hits = 0;
  for (const t of inputTokens) if (candTokens.has(t)) hits++;
  const score = hits / inputTokens.length;

  // Strict majority — exact 50% does NOT pass. homes #50.
  return { matched: score > 0.5, score };
}
